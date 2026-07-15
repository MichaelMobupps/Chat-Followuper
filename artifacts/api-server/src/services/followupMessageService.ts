import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import {
  db,
  followupsTable,
  prospectsTable,
  usersTable,
  dailyUsageTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";
import {
  resolveDoctrineVariant,
  doctrineVariantInstruction,
} from "../lib/doctrineVariant";
import {
  generateChatMessage,
  type ProspectInput,
} from "./messageGenerator";
import type { ConversationRow, PreviousFollowup } from "./messagePrompts";
import type { ProspectBrief } from "./prospectResearch";
import { isChannelCode, type ChannelCode } from "../lib/channelRegister";
import { assertUnderDailyLlmCap } from "../lib/llmSpendCap";
import { usageBucketDate } from "../lib/usageBucket";
import { logger } from "../lib/logger";
import { setFollowupProgress } from "./prepareProgress";


function buildConversation(
  prospect: {
    firstMessageBody: string | null;
    firstMessageSentAt: Date | null;
    prePlatformContext: string | null;
    firstMessageChannel: string | null;
  },
  channel: ChannelCode,
  sentFollowups: { stage: number; generatedMessage: string | null; sentAt: Date | null }[],
): ConversationRow[] {
  const rows: ConversationRow[] = [];

  if (prospect.prePlatformContext?.trim()) {
    rows.push({
      direction: "outbound",
      body: prospect.prePlatformContext.trim(),
      timestamp: new Date().toISOString(),
      channel,
    });
  }

  if (prospect.firstMessageBody?.trim()) {
    rows.push({
      direction: "outbound",
      body: prospect.firstMessageBody.trim(),
      timestamp: (
        prospect.firstMessageSentAt ?? new Date()
      ).toISOString(),
      channel,
    });
  }

  for (const f of sentFollowups) {
    if (!f.generatedMessage?.trim()) continue;
    rows.push({
      direction: "outbound",
      body: f.generatedMessage.trim(),
      timestamp: (f.sentAt ?? new Date()).toISOString(),
      channel,
    });
  }

  return rows;
}

/**
 * Generate a follow-up message for a scheduled row (stage >= 1), persist it
 * on the followups row, and return the body. Used by the email open-link
 * flow and by send-next when message_not_generated.
 */
export async function generateAndPersistFollowupMessage(params: {
  followupId: number;
  userId: string;
  senderName: string;
}): Promise<{ message: string; costUsd: number }> {
  const { followupId, userId, senderName } = params;

  const rows = await db
    .select({
      followup: followupsTable,
      prospect: prospectsTable,
      stageTiming: usersTable.stageTiming,
      digestTimezone: usersTable.digestTimezone,
      // Admin kill switch — read FRESH here, not inherited from the caller's
      // req.user. See the guard below.
      followupsPaused: usersTable.followupsPaused,
    })
    .from(followupsTable)
    .innerJoin(
      prospectsTable,
      eq(followupsTable.prospectId, prospectsTable.id),
    )
    .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
    .where(
      and(
        eq(followupsTable.id, followupId),
        eq(prospectsTable.userId, userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error("followup_not_found");
  }

  const { followup, prospect } = row;

  // Admin kill switch — the BACKSTOP, added by the 2026-07-15 audit.
  //
  // The routes already gate on req.user.followupsPaused, but loadUser reads that
  // ONCE at request entry and this function then runs the LLM chain: up to 5
  // Anthropic retries with [1,2,4,8,16]s backoff, plus healing iterations —
  // tens of seconds to minutes. An admin who pauses at t+5s would find the
  // route still handing back a deep link at t+40s, and in a manual-send tool
  // handing over the link IS the send. The window was minutes wide.
  //
  // This is the one true chokepoint for follow-up GENERATION (all three gated
  // routes funnel through it), it already joins usersTable, and the flag is read
  // in the same query as the row — so the gate closes to the width of one
  // generation instead of one request. Placed BEFORE the cached-message
  // short-circuit so a paused rep gets nothing back, cached or fresh.
  if (row.followupsPaused) {
    throw new Error("followups_paused");
  }

  if (followup.generatedMessage?.trim()) {
    // Progress (Phase I): cached message — the run is instantly done.
    setFollowupProgress(userId, followupId, "ready");
    return { message: followup.generatedMessage, costUsd: 0 };
  }

  // Daily spend cap (LLM3): pre-check before generation (the cached-message
  // path above spends nothing and is allowed through). Throws → 429 via the
  // terminal error handler. No-op when the cap env is unset.
  await assertUnderDailyLlmCap(userId);

  const rawChannel = followup.channel;
  if (!isChannelCode(rawChannel)) {
    throw new Error("invalid_channel");
  }
  const channel: ChannelCode = rawChannel;

  const brief = prospect.researchBrief as ProspectBrief | null;
  if (!brief || typeof brief !== "object") {
    throw new Error("research_not_complete");
  }

  const sentFollowups = await db
    .select({
      stage: followupsTable.stage,
      generatedMessage: followupsTable.generatedMessage,
      sentAt: followupsTable.sentAt,
    })
    .from(followupsTable)
    .where(
      and(
        eq(followupsTable.prospectId, prospect.id),
        eq(followupsTable.channel, channel),
        isNotNull(followupsTable.sentAt),
      ),
    )
    .orderBy(asc(followupsTable.stage));

  const conversation = buildConversation(prospect, channel, sentFollowups);
  if (conversation.length === 0 && !prospect.firstMessageBody?.trim()) {
    throw new Error("missing_conversation_context");
  }

  const previousFollowups: PreviousFollowup[] = sentFollowups
    .filter((f) => f.generatedMessage?.trim())
    .map((f) => ({
      stage: f.stage,
      body: f.generatedMessage!.trim(),
    }));

  const daysSinceFirst = prospect.firstMessageSentAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - prospect.firstMessageSentAt.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  const prospectInput: ProspectInput = {
    prospectName: prospect.prospectName ?? "",
    company: prospect.company ?? "",
    vertical: prospect.vertical ?? "",
    subVertical: prospect.subVertical ?? null,
    product: prospect.product ?? "",
    country: prospect.country ?? "",
    language: prospect.language ?? "en",
    contextNotes: prospect.contextNotes ?? undefined,
  };

  const variant = resolveDoctrineVariant(row.stageTiming, followup.stage);
  const variantInstruction = doctrineVariantInstruction(variant);

  // Progress (Phase I): writer chain starting. No "researching" stage here —
  // follow-ups reuse the persisted research brief (guarded above).
  setFollowupProgress(userId, followupId, "writing");

  const start = Date.now();
  const generated = await generateChatMessage({
    prospect: prospectInput,
    channel,
    stage: followup.stage,
    senderName,
    conversation,
    daysSinceFirst,
    previousFollowups,
    researchBrief: brief,
    doctrineVariantInstruction: variantInstruction,
    ledger: { userId, prospectId: prospect.id },
  });

  const costUsd = generated.costEstimate.usd;

  // Progress (Phase I): message generated — persisting body + spend.
  setFollowupProgress(userId, followupId, "finalizing");

  // DB7: user's local-day bucket so LLM spend lands in the same row the cap reads.
  const today = usageBucketDate(row.digestTimezone);
  // L8: persist the generated message + its spend atomically (like
  // generateMessage), so a failure between them can't charge without saving or
  // save without charging.
  await db.transaction(async (tx) => {
    await tx
      .update(followupsTable)
      .set({ generatedMessage: generated.message })
      .where(eq(followupsTable.id, followupId));

    await tx
      .insert(dailyUsageTable)
      .values({
        userId,
        date: today,
        messagesGenerated: 1,
        anthropicSpendUsd: costUsd.toFixed(4),
      })
      .onConflictDoUpdate({
        target: [dailyUsageTable.userId, dailyUsageTable.date],
        set: {
          messagesGenerated: sql`${dailyUsageTable.messagesGenerated} + 1`,
          anthropicSpendUsd: sql`${dailyUsageTable.anthropicSpendUsd} + CAST(${costUsd.toFixed(4)} AS numeric)`,
        },
      });
  });

  try {
    await db.insert(actionLogsTable).values({
      userId,
      prospectId: prospect.id,
      followupId,
      actionType: ACTION_TYPES.followupGenerated,
      actionStatus: "success",
      durationMs: Date.now() - start,
      metadata: {
        stage: followup.stage,
        channel,
        costUsd,
        via: "on_demand",
      },
    });
  } catch (err) {
    logger.warn({ err }, "followup generate: audit log failed");
  }

  // Progress (Phase I): done — the FE stops polling on "ready".
  setFollowupProgress(userId, followupId, "ready");

  return { message: generated.message, costUsd };
}