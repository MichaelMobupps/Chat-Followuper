import { and, eq, sql } from "drizzle-orm";
import {
  db,
  prospectsTable,
  usersTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
  type Prospect,
} from "@workspace/db";
import { getLanguageForCountry } from "../lib/geoGate";
import { isValidSubVertical, getDoctrineDomain } from "../lib/doctrine/taxonomy";
import { classifySeed } from "./seedClassifier";
import { assertUnderDailyLlmCap, recordDailyLlmSpend } from "../lib/llmSpendCap";
import { usageBucketDate } from "../lib/usageBucket";
import { researchProspect, type ProspectBrief } from "./prospectResearch";
import { LoggingProgressEmitter } from "./progressEvents";
import {
  generateChatMessage,
  type ProspectInput,
} from "./messageGenerator";
import { generateLink } from "./channels/whatsapp";
import { generateLink as generateTelegramLink } from "./channels/telegram";
import { generateLink as generateLinkedinLink } from "./channels/linkedin";
import { GeoGateBlockedError } from "./channels/whatsapp";
import { isChannelCode, type ChannelCode } from "../lib/channelRegister";
import { logger } from "../lib/logger";
import { appendMessageTemplate } from "../lib/messageTemplate";
import { setPrepareProgress } from "./prepareProgress";

export type PrepareStatus =
  | "ready"
  | "research_complete"
  | "already_ready";

export interface PrepareFirstMessageResult {
  status: PrepareStatus;
  prospectId: string;
  message: string | null;
  deepLinkUrl: string | null;
  researchCostUsd?: number;
  generationCostUsd?: number;
}


function defaultSubVertical(vertical: string | null): string {
  if (vertical === "web_cps") return "cps_web_classifieds_general";
  return "utility_general_mobile";
}

function defaultProduct(vertical: string | null): string {
  if (vertical === "web_cps") return "CPS / performance marketing";
  return "mobile user acquisition";
}

function resolveChannel(prospect: Prospect, requested?: ChannelCode): ChannelCode {
  if (requested) return requested;
  const stored = prospect.firstMessageChannel;
  if (stored && isChannelCode(stored)) return stored;
  if (prospect.telegramHandle && !prospect.phone) return "telegram";
  // F-A: a linkedin-only prospect (URL set, no phone/handle) defaults to linkedin.
  if (prospect.linkedinUrl && !prospect.phone && !prospect.telegramHandle)
    return "linkedin";
  return "whatsapp";
}

function buildDeepLink(
  channel: ChannelCode,
  prospect: Prospect,
  message: string,
): string {
  if (channel === "telegram") {
    const id = prospect.telegramHandle ?? prospect.phone;
    if (!id) throw new Error("no_telegram_identifier");
    return generateTelegramLink(id, message);
  }
  if (channel === "linkedin") {
    // F-A: LinkedIn is clipboard-only. The deep link is the bare profile URL
    // (no prefill); the FE copies `message`. Without this branch a linkedin-only
    // prospect fell through to the phone path and threw a misleading no_phone.
    if (!prospect.linkedinUrl) throw new Error("no_linkedin_identifier");
    return generateLinkedinLink(prospect.linkedinUrl, message);
  }
  if (!prospect.phone) throw new Error("no_phone");
  return generateLink(prospect.phone, message);
}

/**
 * Run research (if needed) and generate the stage-0 message for a manually
 * ingested contact. Returns a deep link when the message is ready to send.
 */
export async function prepareFirstMessage(params: {
  prospectId: string;
  userId: string;
  senderName: string;
  channel?: ChannelCode;
  /**
   * Regenerate: skip the cached-message short-circuit and re-run the writer
   * even when firstMessageBody is already set. Off by default — every existing
   * caller (add-flow, row Generate, prepare-and-send) keeps the cheap cached
   * path. Only the preview dialog's explicit "Regenerate" sets it, so a
   * re-write is always a deliberate, user-initiated spend.
   *
   * Cost: usually writer-only, because research/classify are gated on
   * `hasBrief` and a regenerated prospect normally already has its brief. That
   * is NOT guaranteed — if researchBrief is null (or was never persisted), a
   * forced run re-runs classify + research too, at full price. Rejected for an
   * already-sent prospect (see the firstMessageSentAt guard below).
   */
  force?: boolean;
}): Promise<PrepareFirstMessageResult> {
  const { prospectId, userId, senderName, force = false } = params;
  const start = Date.now();

  const [prospectRows, userRows] = await Promise.all([
    db
      .select()
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({
        messageTemplate: usersTable.messageTemplate,
        digestTimezone: usersTable.digestTimezone,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1),
  ]);

  const rows = prospectRows;
  const userMessageTemplate = userRows[0]?.messageTemplate;
  const userTimezone = userRows[0]?.digestTimezone;

  const prospect = rows[0];
  if (!prospect) {
    throw new Error("not_found");
  }

  const channel = resolveChannel(prospect, params.channel);

  // AUDIT [High] — the cached-message short-circuit below used to be the only
  // thing protecting an already-SENT prospect's body, and `force` walks past
  // it. Overwriting it corrupts the follow-up chain: followupMessageService
  // feeds the stored firstMessageBody + firstMessageSentAt to the writer as
  // "what you already sent on <date>", so every later follow-up would cite a
  // message the prospect never received. Status stays "sent" (it keys off
  // firstMessageSentAt), so nothing would surface the swap to the SDR either.
  // Regenerating is only meaningful BEFORE the first send.
  if (force && prospect.firstMessageSentAt) {
    throw new Error("already_sent");
  }

  // L10: the cached-message short-circuit must come BEFORE the spend-cap check.
  // Returning an already-generated (already-paid) message does no LLM work, so
  // a capped user should still be able to fetch it. (followupMessageService
  // already orders it this way.)
  //
  // `force` (Regenerate) deliberately bypasses this: the caller wants a NEW
  // message, which is real LLM work, so it falls through to the spend-cap
  // pre-check below like any other generating path.
  if (!force && prospect.firstMessageBody?.trim()) {
    let deepLinkUrl: string | null = null;
    try {
      deepLinkUrl = buildDeepLink(channel, prospect, prospect.firstMessageBody);
    } catch {
      deepLinkUrl = null;
    }
    // Progress (Phase H): cached message — the run is instantly done.
    setPrepareProgress(userId, prospectId, "ready");
    return {
      status: "already_ready",
      prospectId,
      message: prospect.firstMessageBody,
      deepLinkUrl,
    };
  }

  // Daily spend cap (LLM3): pre-check before any LLM work (this path runs both
  // research and generation, each Anthropic-billed). Throws → 429 via the
  // terminal error handler. No-op when the cap env is unset.
  await assertUnderDailyLlmCap(userId);

  // Ask-less classification: derive the datapoints research + the writer need
  // (sub-vertical, country, language, product) from the company/URL seed when the
  // operator did not supply them. Any value the operator DID set wins as an
  // override. Runs at most once per prospect — the results persist below, so a
  // second generate skips it.
  let subVertical = isValidSubVertical(prospect.subVertical ?? "")
    ? (prospect.subVertical as string)
    : "";
  let vertical =
    prospect.vertical === "web_cps" || prospect.vertical === "mobile"
      ? prospect.vertical
      : "";
  let country = prospect.country ?? "";
  let language = prospect.language ?? "";
  let product = prospect.product ?? "";

  const hasBrief =
    !!prospect.researchBrief && typeof prospect.researchBrief === "object";
  const needsClassify =
    !hasBrief && (!subVertical || !country || !language || !product);

  if (needsClassify && prospect.company?.trim()) {
    setPrepareProgress(userId, prospectId, "researching");
    try {
      const seedUrl =
        (prospect.prePlatformContext ?? "").match(/https?:\/\/\S+/)?.[0] ??
        (prospect.contextNotes ?? "").match(/https?:\/\/\S+/)?.[0];
      const classified = await classifySeed({
        seed: seedUrl || prospect.company.trim(),
        company: prospect.company.trim(),
        vertical:
          prospect.vertical === "web_cps" || prospect.vertical === "mobile"
            ? prospect.vertical
            : undefined,
        subVertical: subVertical || undefined,
        country: country || undefined,
        language: language || undefined,
        product: product || undefined,
        ledger: { userId, prospectId },
      });
      subVertical = classified.subVertical;
      vertical = classified.vertical || vertical;
      country = classified.country || country;
      language = classified.language || language;
      product = classified.product || product;
      if (classified.costUsd > 0) {
        // Book the classify spend NOW (not only in the terminal txn) so it isn't
        // lost if research/generation throws before that transaction runs.
        await recordDailyLlmSpend(userId, classified.costUsd).catch((e) =>
          logger.warn(
            { err: String(e) },
            "manual prepare: classify spend record failed",
          ),
        );
      }
    } catch (err) {
      logger.warn(
        { err: String(err) },
        "manual prepare: seed classification failed; using defaults",
      );
    }
  }

  // Fill any remaining gaps with the coarse platform defaults.
  if (!isValidSubVertical(subVertical))
    subVertical = defaultSubVertical(prospect.vertical);
  // Keep the coarse vertical consistent with the (now-final) sub-vertical.
  if (vertical !== "web_cps" && vertical !== "mobile") {
    vertical = getDoctrineDomain(subVertical) === "webCps" ? "web_cps" : "mobile";
  }
  if (!language) language = country ? getLanguageForCountry(country) : "en";
  if (!product) product = defaultProduct(prospect.vertical);

  let researchCostUsd = 0;
  let brief: ProspectBrief;

  if (hasBrief) {
    brief = prospect.researchBrief as ProspectBrief;
  } else {
    if (!prospect.company?.trim()) {
      throw new Error("missing_company");
    }

    // Progress (Phase H): entering the research phase.
    setPrepareProgress(userId, prospectId, "researching");

    const researchResult = await researchProspect(
      {
        brand: prospect.company.trim(),
        country,
        language,
        subVertical,
        product,
        sdrContextNotes:
          prospect.prePlatformContext ??
          prospect.contextNotes ??
          undefined,
        ledger: { userId, prospectId },
      },
      new LoggingProgressEmitter(),
    );

    brief = researchResult.brief;
    researchCostUsd = researchResult.cost.usd;

    await db
      .update(prospectsTable)
      .set({
        researchBrief: brief,
        vertical,
        language,
        subVertical,
        product,
        country: country || prospect.country,
      })
      // AUDIT [Low] — scope on userId like the terminal txn does. Not an IDOR
      // today (the row was already SELECTed under a userId filter above), but
      // an unscoped write here is one refactor away from becoming one.
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, userId),
        ),
      );
  }

  const prospectInput: ProspectInput = {
    prospectName: prospect.prospectName ?? "",
    company: prospect.company ?? "",
    vertical,
    subVertical,
    product,
    country,
    language,
    contextNotes:
      prospect.prePlatformContext ??
      prospect.contextNotes ??
      undefined,
  };

  // Progress (Phase H): research done (or cached) — writer chain starting.
  setPrepareProgress(userId, prospectId, "writing");

  const generated = await generateChatMessage({
    prospect: prospectInput,
    channel,
    stage: 0,
    senderName,
    researchBrief: brief,
    ledger: { userId, prospectId },
  });

  // Progress (Phase H): message generated — persisting + building link.
  setPrepareProgress(userId, prospectId, "finalizing");

  const generationCostUsd = generated.costEstimate.usd;
  const finalMessage = appendMessageTemplate(
    generated.message,
    userMessageTemplate,
  );
  // DB7: user's local-day bucket so LLM spend lands in the same row the cap reads.
  const today = usageBucketDate(userTimezone);

  // L8: message body + spend must be one atomic unit (like generateMessage).
  // Two separate awaits let a failure between them either save the message but
  // lose the spend (cap under-counts) or charge without persisting.
  await db.transaction(async (tx) => {
    await tx
      .update(prospectsTable)
      .set({
        firstMessageBody: finalMessage,
        firstMessageChannel: channel,
        vertical,
        language,
        subVertical,
        product,
      })
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, userId),
        ),
      );

    await tx
      .insert(dailyUsageTable)
      .values({
        userId,
        date: today,
        messagesGenerated: 1,
        anthropicSpendUsd: (researchCostUsd + generationCostUsd).toFixed(4),
      })
      .onConflictDoUpdate({
        target: [dailyUsageTable.userId, dailyUsageTable.date],
        set: {
          messagesGenerated: sql`${dailyUsageTable.messagesGenerated} + 1`,
          anthropicSpendUsd: sql`${dailyUsageTable.anthropicSpendUsd} + CAST(${(researchCostUsd + generationCostUsd).toFixed(4)} AS numeric)`,
        },
      });
  });

  try {
    await db.insert(actionLogsTable).values({
      userId,
      prospectId,
      actionType: ACTION_TYPES.seederMessageGenerated,
      actionStatus: "success",
      durationMs: Date.now() - start,
      metadata: {
        channel,
        costUsd: generationCostUsd,
        researchCostUsd,
        via: "manual_prepare",
        iterations: generated.modelMetadata.iterations,
        finalOverallScore: generated.modelMetadata.finalOverallScore,
      },
    });
  } catch (err) {
    logger.warn({ err }, "manual prepare: audit log failed");
  }

  let deepLinkUrl: string | null;
  try {
    deepLinkUrl = buildDeepLink(channel, prospect, finalMessage);
  } catch (err) {
    if (err instanceof GeoGateBlockedError) {
      throw err;
    }
    // AUDIT [Med] — on a REGENERATE the new body is already committed above, so
    // rethrowing here (no_phone / no_telegram_identifier / no_linkedin_identifier
    // when the requested channel doesn't match the prospect's identifiers) would
    // 409 the call AFTER destroying the message the SDR already had, and after
    // billing for the rewrite. Degrade to a null link instead — exactly what the
    // cached path does — so the message survives and is still reviewable; the
    // caller reports "link unavailable". First-generate keeps throwing: there
    // was no prior message to lose, and the hard error is the useful signal.
    if (!force) throw err;
    logger.warn(
      { err: String(err), prospectId, channel },
      "manual prepare: regenerated message saved but deep link unavailable",
    );
    deepLinkUrl = null;
  }

  // Progress (Phase H): done — the FE stops polling on "ready".
  setPrepareProgress(userId, prospectId, "ready");

  return {
    status: "ready",
    prospectId,
    message: finalMessage,
    deepLinkUrl,
    researchCostUsd,
    generationCostUsd,
  };
}