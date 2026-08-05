/**
 * Generate first message — Ticket 1.7.
 *
 * POST /api/prospects/:id/generate-message
 *
 * Runs the messageGenerator pipeline (prospector mode, stage 0) for a
 * prospect that has a researchBrief but no firstMessageBody yet. Persists
 * the generated body, increments daily spend, logs an action_logs entry,
 * returns { message, subject, costUsd }.
 *
 * Preconditions enforced before generation:
 *   - Prospect exists AND belongs to the requesting user (ownership)
 *   - Prospect has a non-null researchBrief
 *   - Prospect has at least: prospectName, company, vertical, country, language
 *
 * If preconditions fail, returns 4xx with a specific error code so the UI
 * can surface a meaningful message ("research not yet complete", etc).
 *
 * Spend tracking:
 *   - On success, increments daily_usage.anthropic_spend_usd for the
 *     (userId, today_utc) row via UPSERT (creates row if absent).
 *   - Also increments messages_generated for the same row.
 *
 * Action log:
 *   - On success: action_type = "seeder.message_generated", status = "success",
 *     metadata = { iterations, finalScore, costUsd, channel }
 *   - On failure: action_type = "seeder.message_generated", status = "failure",
 *     metadata = { errorCode }
 */

import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  ACTION_TYPES,
  actionLogsTable,
  db,
  dailyUsageTable,
  prospectsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  generateChatMessage,
  MissingContextError,
  type ProspectInput,
} from "../services/messageGenerator";
import { isChannelCode, type ChannelCode } from "../lib/channelRegister";
import { assertUnderDailyLlmCap } from "../lib/llmSpendCap";
import { usageBucketDate } from "../lib/usageBucket";
import type { ProspectBrief } from "../services/prospectResearch";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function isResearchBrief(value: unknown): value is ProspectBrief {
  // Light shape check. The full ProspectBrief schema lives in
  // prospectResearch.ts and is enforced when the brief is written; here
  // we only guard against null/undefined/non-object before passing to
  // the generator.
  return typeof value === "object" && value !== null;
}

function senderNameFor(req: Request): string {
  const user = req.user!;
  if (user.name && user.name.trim().length > 0) {
    return user.name.trim().split(/\s+/)[0]!;
  }
  // Fall back to local-part of email. Avoids passing an empty string into
  // the prompt, which would degrade output quality.
  const local = user.email.split("@")[0] ?? "there";
  return local;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/prospects/:id/generate-message
// ─────────────────────────────────────────────────────────────────

router.post(
  "/prospects/:id/generate-message",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const prospectId = String(req.params.id);
    const start = Date.now();

    // ── Ownership-checked fetch ──
    const rows = await db
      .select()
      .from(prospectsTable)
      .where(
        and(
          eq(prospectsTable.id, prospectId),
          eq(prospectsTable.userId, user.id),
        ),
      )
      .limit(1);

    const prospect = rows[0];
    if (!prospect) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // ── Precondition: researchBrief must be populated ──
    if (!isResearchBrief(prospect.researchBrief)) {
      res.status(409).json({ error: "research_not_complete" });
      return;
    }

    // ── Precondition: minimal prospect fields ──
    const missing: string[] = [];
    if (!prospect.prospectName) missing.push("prospectName");
    if (!prospect.company) missing.push("company");
    if (!prospect.language) missing.push("language");
    // country intentionally not required: Apollo's people-search returns
    // inconsistent country formats (full English names vs ISO-2). The FE
    // strips non-ISO values to satisfy the strict create schema, which
    // means country is legitimately null for many Apollo prospects.
    // The downstream prospectInput uses "" as the country fallback, so
    // message generation succeeds without country (slightly less
    // localized output).
    if (missing.length > 0) {
      res.status(409).json({ error: "missing_fields", fields: missing });
      return;
    }

    // ── Channel resolution ──
    // Use prospect.firstMessageChannel if set; default to whatsapp otherwise.
    // whatsapp and telegram both have deep-link adapters + per-channel prompts.
    const rawChannel = prospect.firstMessageChannel ?? "whatsapp";
    if (!isChannelCode(rawChannel)) {
      res.status(409).json({ error: "invalid_channel", channel: rawChannel });
      return;
    }
    const channel: ChannelCode = rawChannel;

    // ── Build ProspectInput ──
    const brief = prospect.researchBrief as ProspectBrief;
    const prospectInput: ProspectInput = {
      prospectName: prospect.prospectName ?? "",
      company: prospect.company ?? "",
      vertical: prospect.vertical ?? "",
      subVertical: prospect.subVertical ?? null,
      // The "product" field on ProspectInput names what we are pitching
      // (MobUpps's offering). The brief's primary product line is the
      // best derivable value; the seeder will also let SDRs override.
      // For now we read from the brief's product field if present, else
      // fall back to the generic vertical descriptor.
      product:
        (typeof (brief as unknown as Record<string, unknown>)["product"] === "string"
          ? ((brief as unknown as Record<string, unknown>)["product"] as string)
          : "") || prospect.product || "",
      country: prospect.country ?? "",
      language: prospect.language ?? "en",
      contextNotes: prospect.contextNotes ?? undefined,
    };

    const senderName = senderNameFor(req);

    // ── Daily spend cap (LLM3) ──
    // Pre-check BEFORE generation. Throws DailyLlmCapExceededError → mapped to
    // 429 by the terminal error handler. No-op when the cap env is unset.
    await assertUnderDailyLlmCap(user.id);

    // ── Generate ──
    let generated;
    try {
      generated = await generateChatMessage({
        prospect: prospectInput,
        channel,
        stage: 0,
        senderName,
        researchBrief: brief,
      });
    } catch (err) {
      const errorCode =
        err instanceof MissingContextError ? "missing_context" : "generation_failed";

      logger.error(
        {
          err,
          prospectId,
          userId: user.id,
          errorCode,
        },
        "generate-message: pipeline failed",
      );

      // Best-effort failure log; never block the response.
      await db.insert(actionLogsTable).values({
        userId: user.id,
        prospectId,
        actionType: ACTION_TYPES.seederMessageGenerated,
        actionStatus: "failure",
        durationMs: Date.now() - start,
        errorDetail: err instanceof Error ? err.message : String(err),
        metadata: { errorCode, channel },
      }).catch((logErr) => {
        logger.warn({ err: logErr }, "generate-message: failed to write action log");
      });

      res.status(500).json({ error: errorCode });
      return;
    }

    const costUsd = generated.costEstimate.usd;

    // ── Persist message + spend atomically (LLM8) ──
    // The prospect body write and the spend/counter increment MUST commit
    // together: a 500 between them would either charge the user without saving
    // the message, or (on a client retry) double-charge for the same draft.
    // A transaction makes it all-or-nothing.
    // DB7: bucket by the user's local day so the LLM daily-spend cap resets at
    // their midnight (matches the llmSpendCap reader's bucket).
    const today = usageBucketDate(user.digestTimezone);
    await db.transaction(async (tx) => {
      await tx
        .update(prospectsTable)
        .set({
          firstMessageBody: generated.message,
          firstMessageChannel: channel,
        })
        .where(
          and(
            eq(prospectsTable.id, prospectId),
            eq(prospectsTable.userId, user.id),
          ),
        );

      // Composite PK is (user_id, date). On conflict, sum into the existing
      // row. cast on numeric column is implicit when the value is a numeric
      // literal in the SQL fragment.
      await tx
        .insert(dailyUsageTable)
        .values({
          userId: user.id,
          date: today,
          messagesGenerated: 1,
          anthropicSpendUsd: costUsd.toFixed(4),
        })
        .onConflictDoUpdate({
          target: [dailyUsageTable.userId, dailyUsageTable.date],
          set: {
            messagesGenerated: sql`${dailyUsageTable.messagesGenerated} + 1`,
            // Explicit cast keeps the bound parameter typed as numeric across
            // drivers (postgres-js binds JS string as text by default, pg
            // binds number as float8; both can fail on `numeric + text` or
            // `numeric + double precision` without a cast).
            anthropicSpendUsd: sql`${dailyUsageTable.anthropicSpendUsd} + CAST(${costUsd.toFixed(4)} AS numeric)`,
          },
        });
    });

    // ── Action log: success (best-effort, outside the tx) ──
    // Audit metadata only — a log-write failure must not roll back the message
    // + spend that already committed, and must not fail the request. Mirrors
    // the failure-path action log below.
    await db
      .insert(actionLogsTable)
      .values({
        userId: user.id,
        prospectId,
        actionType: ACTION_TYPES.seederMessageGenerated,
        actionStatus: "success",
        durationMs: Date.now() - start,
        metadata: {
          channel,
          costUsd,
          iterations: generated.modelMetadata.iterations,
          finalOverallScore: generated.modelMetadata.finalOverallScore,
          inputTokens: generated.costEstimate.inputTokens,
          outputTokens: generated.costEstimate.outputTokens,
        },
      })
      .catch((logErr) => {
        logger.warn({ err: logErr }, "generate-message: failed to write success action log");
      });

    res.status(200).json({
      subject: generated.subject,
      message: generated.message,
      costUsd,
      iterations: generated.modelMetadata.iterations,
      finalOverallScore: generated.modelMetadata.finalOverallScore,
    });
  },
);

export default router;
