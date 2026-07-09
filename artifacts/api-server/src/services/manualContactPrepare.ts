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
import { assertUnderDailyLlmCap } from "../lib/llmSpendCap";
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
}): Promise<PrepareFirstMessageResult> {
  const { prospectId, userId, senderName } = params;
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

  // L10: the cached-message short-circuit must come BEFORE the spend-cap check.
  // Returning an already-generated (already-paid) message does no LLM work, so
  // a capped user should still be able to fetch it. (followupMessageService
  // already orders it this way.)
  if (prospect.firstMessageBody?.trim()) {
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

  const country = prospect.country ?? "";
  const language =
    prospect.language ??
    (country ? getLanguageForCountry(country) : "en");
  const subVertical =
    prospect.subVertical ?? defaultSubVertical(prospect.vertical);
  const product = prospect.product ?? defaultProduct(prospect.vertical);

  let researchCostUsd = 0;
  let brief: ProspectBrief;

  if (
    prospect.researchBrief &&
    typeof prospect.researchBrief === "object"
  ) {
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
      },
      new LoggingProgressEmitter(),
    );

    brief = researchResult.brief;
    researchCostUsd = researchResult.cost.usd;

    await db
      .update(prospectsTable)
      .set({
        researchBrief: brief,
        language,
        subVertical,
        product,
        country: country || prospect.country,
      })
      .where(eq(prospectsTable.id, prospectId));
  }

  const prospectInput: ProspectInput = {
    prospectName: prospect.prospectName ?? "",
    company: prospect.company ?? "",
    vertical: prospect.vertical ?? "",
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

  let deepLinkUrl: string;
  try {
    deepLinkUrl = buildDeepLink(channel, prospect, finalMessage);
  } catch (err) {
    if (err instanceof GeoGateBlockedError) {
      throw err;
    }
    throw err;
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