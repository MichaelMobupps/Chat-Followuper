/**
 * Per-call LLM cost ledger writer (2026-07-15).
 *
 * One row per model invocation in `llm_calls`. See lib/db/src/schema/llm_calls.ts
 * for why the table exists and what it can't backfill.
 *
 * TWO RULES, both learned from the mechanisms this replaces:
 *
 * 1. A LEDGER WRITE MUST NEVER BREAK A GENERATION. Every write here is
 *    best-effort and swallows its own errors — matching how action_logs and
 *    recordDailyLlmSpend already behave. Accounting is not worth a rep's
 *    message. The spend already happened when we get here; failing the request
 *    would lose the message AND still cost the money.
 *
 * 2. AN UNATTRIBUTED CALL IS STILL A ROW. `userId` is nullable and we write the
 *    row regardless. Money we cannot attribute is precisely what an accounting
 *    view must SHOW — dropping the row would make the ledger look tidy and
 *    reconcile to the wrong number. Offline callers (benches, smokes) pass no
 *    ledger context at all and are skipped entirely; that is different from an
 *    unattributed production call and must stay different.
 */
import { db, llmCallsTable } from "@workspace/db";
import { priceFor, type CostBreakdown } from "./pricing";
import { logger } from "./logger";

/**
 * Attribution for a spending call. Threaded explicitly from the service entry
 * points rather than read from AsyncLocalStorage: for an accounting ledger,
 * "who is this for" should be a compile error to omit, not an ambient value
 * that silently resolves to undefined on a path nobody thought about.
 */
export interface LedgerContext {
  userId: string;
  prospectId?: string | null;
}

export interface RecordLlmCallInput {
  ledger?: LedgerContext | undefined;
  task: string;
  model: string;
  provider: string;
  fallback?: boolean;
  cost: CostBreakdown;
}

/**
 * Write one ledger row. Best-effort: never throws, never rejects.
 *
 * Deliberately NOT awaited-for-correctness by callers — they may await it to
 * keep ordering deterministic in tests, but nothing downstream depends on it.
 */
export async function recordLlmCall(input: RecordLlmCallInput): Promise<void> {
  // No ledger context = an offline caller (bench harness, smoke script). Those
  // are not production spend against a user and must not manufacture rows with
  // a null user — that would be indistinguishable from a real unattributed
  // production call, which is a genuine accounting signal we need to keep loud.
  if (!input.ledger) return;

  try {
    // `usd: 0` is ambiguous — it means either "genuinely free" or "we have no
    // price for this model and computeCost booked zero + warned". The ledger
    // must distinguish them: an unpriced model is how this table goes quietly
    // wrong (a model-id bump silently books $0 forever). priceFor is the same
    // resolver computeCost uses, so this asks the exact question that produced
    // the number, rather than inferring from it.
    const costUnpriced = priceFor(input.model) === undefined;

    await db.insert(llmCallsTable).values({
      userId: input.ledger.userId,
      prospectId: input.ledger.prospectId ?? null,
      task: input.task,
      model: input.model,
      provider: input.provider,
      fallback: input.fallback ?? false,
      inputTokens: input.cost.inputTokens,
      outputTokens: input.cost.outputTokens,
      // numeric(12,6) — drizzle takes numerics as strings to avoid float drift.
      costUsd: input.cost.usd.toFixed(6),
      costUnpriced,
    });
  } catch (err) {
    // Swallow: see rule 1. Logged at warn (not error) because the request
    // itself succeeded — this is a lost accounting row, not a failed action.
    logger.warn(
      { err, task: input.task, model: input.model },
      "[llm-ledger] failed to record LLM call — spend happened but is unledgered",
    );
  }
}
