import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { prospectsTable } from "./prospects";

/**
 * Per-call LLM cost ledger (2026-07-15). One row per model invocation.
 *
 * WHY THIS EXISTS. Two mechanisms already record LLM cost and both are lossy:
 *   - `daily_usage.anthropic_spend_usd` — ONE summed USD per (user, local-day).
 *     Model, provider, task, tokens and prospect are all discarded.
 *   - `action_logs.metadata` — cost lives in an untyped jsonb blob, summed
 *     across a whole writer→critic→rewriter chain, so 3-7 calls across 2
 *     providers and 3 models collapse into one number with no per-model split.
 * Neither can answer "what did we spend, on which model, for whom" — which is
 * the only question an accountant-facing view exists to answer.
 *
 * THE DATA GAP, stated once here so nobody hunts for it: per-model history
 * CANNOT be backfilled. `modelMetadata.draftModel/criticModel/rewriterModel`
 * exist per call today but are discarded at the log boundary, so this ledger
 * only ever covers calls made after it deploys. Charts start at deploy day.
 *
 * DESIGN NOTES
 * - Rows are written at `callLLMRole` (lib/llm/router.ts), NOT at the service
 *   entry points. By the time generateChatMessage returns, `sumCosts` has
 *   already blended every call in the chain into one CostBreakdown — a row
 *   written there could only carry a dishonest `model`.
 * - `userId` is nullable and ON DELETE SET NULL, matching action_logs. An
 *   unattributed call must still appear as its own row: money we cannot
 *   attribute is exactly what an accounting view must SHOW, never hide. The
 *   admin view surfaces null-user rows as their own line, not as a filter.
 * - `costUsd` is numeric(12,6), not float. Money is never a float, and 6dp
 *   because a single cheap call is ~$0.000012 — 4dp (daily_usage's scale)
 *   would round most individual rows to zero.
 * - `prospectId` is genuinely nullable: 5 of the 10 production call sites spend
 *   money BEFORE a prospect row exists (seed classification, research from the
 *   stream route, first-message preview).
 */
export const llmCallsTable = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // SET NULL, not CASCADE: deleting a user must not erase the record that we
    // spent money on their behalf. The spend happened.
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    prospectId: uuid("prospect_id").references(() => prospectsTable.id, {
      onDelete: "set null",
    }),
    /**
     * What the call was for: "draft" | "critic" | "rewriter" | "lint" |
     * "research" | "classify" | "resolve_company" | "validate_orgs" |
     * "opus_rescue". Free text rather than an enum so a new task cannot fail a
     * ledger write — a missing row is worse than an unrecognised label.
     */
    task: text("task").notNull(),
    /** Post-fallback ACTUAL model, never the one we asked for. */
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    /** True when the primary model didn't serve and the chain fell back. */
    fallback: boolean("fallback").notNull().default(false),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    /**
     * True when computeCost had no price entry for the model and booked $0.
     * Without this flag an unpriced model is indistinguishable from a free
     * call, and the ledger would silently under-report on a model-id bump —
     * which is the single most likely way this table goes quietly wrong.
     */
    costUnpriced: boolean("cost_unpriced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The admin view's primary access pattern: one user's spend over a window.
    index("llm_calls_user_created_idx").on(table.userId, table.createdAt),
    // "what does each model cost us" — the rollup the whole table is for.
    index("llm_calls_model_idx").on(table.model),
    index("llm_calls_task_idx").on(table.task),
    // Covering index for the FK: this table is append-only and unbounded, so an
    // unindexed FK makes every prospect delete seq-scan + lock it (same reason
    // action_logs carries one — see DB4).
    index("llm_calls_prospect_id_idx").on(table.prospectId),
  ],
);

export const insertLlmCallSchema = createInsertSchema(llmCallsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLlmCall = z.infer<typeof insertLlmCallSchema>;
export type LlmCall = typeof llmCallsTable.$inferSelect;
