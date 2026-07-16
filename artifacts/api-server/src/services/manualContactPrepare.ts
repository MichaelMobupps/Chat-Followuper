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

export interface EnsureBriefResult {
  brief: ProspectBrief;
  /** Final coarse vertical ("web_cps" | "mobile") after classify + defaults. */
  vertical: string;
  subVertical: string;
  language: string;
  product: string;
  country: string;
  /** 0 when the brief already existed (nothing was spent). */
  researchCostUsd: number;
}

/**
 * Make sure a prospect has a research brief, running classify + research and
 * persisting the results when it doesn't. Extracted from prepareFirstMessage
 * (Speed pass, 2026-07-16) so brief-ONLY callers exist:
 *   - manual-ingest's background prepare, for contacts created with a PASTED
 *     first message (body present, brief absent — research must still happen
 *     or every later follow-up dies on research_not_complete);
 *   - followupMessageService's lazy-research fallback, which the hourly
 *     pre-generation pass drives so no human is waiting on it.
 *
 * Spend accounting: classify AND research are booked here, immediately, via
 * recordDailyLlmSpend — not in the caller's terminal transaction. A writer
 * failure after research already happened must not lose the research spend,
 * and brief-only callers have no terminal transaction at all. Callers that go
 * on to generate must therefore book ONLY their generation cost.
 *
 * The caller is responsible for ownership checks (the prospect row was loaded
 * under a userId filter) and for the daily spend-cap pre-check.
 */
export async function ensureProspectBrief(params: {
  prospect: Prospect;
  userId: string;
}): Promise<EnsureBriefResult> {
  const { prospect, userId } = params;
  const prospectId = prospect.id;

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

  if (hasBrief) {
    return {
      brief: prospect.researchBrief as ProspectBrief,
      vertical,
      subVertical,
      language,
      product,
      country,
      researchCostUsd: 0,
    };
  }

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

  const brief = researchResult.brief;
  const researchCostUsd = researchResult.cost.usd;

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

  // Research spend is booked here for the same reason classify's is: the
  // caller may fail (or not exist — brief-only paths) before any terminal
  // transaction runs, and losing the single most expensive call we make
  // under-counts the cap by dollars, not cents.
  if (researchCostUsd > 0) {
    await recordDailyLlmSpend(userId, researchCostUsd).catch((e) =>
      logger.warn(
        { err: String(e) },
        "manual prepare: research spend record failed",
      ),
    );
  }

  return {
    brief,
    vertical,
    subVertical,
    language,
    product,
    country,
    researchCostUsd,
  };
}

// In-flight dedupe (Speed pass, 2026-07-16): the same prospect can now have
// two generation triggers alive at once — the background prepare queued by
// manual-ingest and an impatient click on the row's Generate button. Sharing
// one promise per (user, prospect) means the second trigger rides the first
// run instead of paying for a second research + writer chain. A concurrent
// `force` (Regenerate) joins the in-flight run too — it still gets a freshly
// written message, which is what Regenerate is for; preventing the double
// spend matters more than honoring the flag twice. In-process only, which
// matches the progress store's single-instance assumption documented in
// prepareProgress.ts.
const inFlightPrepares = new Map<string, Promise<PrepareFirstMessageResult>>();

/**
 * Run research (if needed) and generate the stage-0 message for a manually
 * ingested contact. Returns a deep link when the message is ready to send.
 */
export async function prepareFirstMessage(params: {
  prospectId: string;
  userId: string;
  senderName: string;
  channel?: ChannelCode;
  force?: boolean;
}): Promise<PrepareFirstMessageResult> {
  const key = `${params.userId}:${params.prospectId}`;
  const existing = inFlightPrepares.get(key);
  if (existing) return existing;
  const run = doPrepareFirstMessage(params);
  inFlightPrepares.set(key, run);
  try {
    return await run;
  } finally {
    inFlightPrepares.delete(key);
  }
}

async function doPrepareFirstMessage(params: {
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

  // Classify + research (or reuse the persisted brief). ensureProspectBrief
  // books its own classify/research spend immediately, so the terminal
  // transaction below records ONLY the generation cost.
  const {
    brief,
    vertical,
    subVertical,
    language,
    product,
    country,
    researchCostUsd,
  } = await ensureProspectBrief({ prospect, userId });

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
  //
  // GENERATION cost only: classify + research spend was already booked inside
  // ensureProspectBrief (which may have run for a caller with no terminal
  // transaction at all). Adding researchCostUsd here again would double-count.
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
        anthropicSpendUsd: generationCostUsd.toFixed(4),
      })
      .onConflictDoUpdate({
        target: [dailyUsageTable.userId, dailyUsageTable.date],
        set: {
          messagesGenerated: sql`${dailyUsageTable.messagesGenerated} + 1`,
          anthropicSpendUsd: sql`${dailyUsageTable.anthropicSpendUsd} + CAST(${generationCostUsd.toFixed(4)} AS numeric)`,
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