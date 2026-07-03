/**
 * Per-user daily LLM spend cap (audit finding LLM3).
 *
 * Before the audit, `daily_usage.anthropic_spend_usd` was written and summed for
 * reporting only — never compared against a limit before generation. A tight
 * loop (or a compromised account) could drive unbounded Anthropic spend. This
 * module adds an env-gated pre-check the generation entry points call before
 * spending: `generateMessage` route, `manualContactPrepare`, and
 * `followupMessageService`.
 *
 * The cap is OFF by default: set `LLM_DAILY_SPEND_CAP_USD` to a positive number
 * to enable it. Unset / non-numeric / <= 0 → disabled (assert is a no-op).
 *
 * The daily bucket is UTC (`YYYY-MM-DD`), matching the writers in the three call
 * sites (`todayUtc()` there uses `toISOString().slice(0,10)`). This keeps the
 * read aligned with the write. (Audit DB7 separately notes the UTC-vs-local
 * bucket concern for all daily_usage accounting; changing the bucket basis is
 * out of scope here — this helper deliberately matches the existing writers.)
 */

import { and, eq } from "drizzle-orm";
import { db, dailyUsageTable } from "@workspace/db";

/**
 * Thrown when today's spend already meets or exceeds the configured cap.
 * Mapped to HTTP 429 `daily_cap_exceeded` by the terminal error handler.
 */
export class DailyLlmCapExceededError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super("daily_cap_exceeded");
    this.name = "DailyLlmCapExceededError";
  }
}

/**
 * Configured cap in USD, or `null` when the cap is disabled (unset / invalid /
 * non-positive). Read per-call so env changes take effect without a restart and
 * tests can toggle it.
 */
export function dailyLlmSpendCapUsd(): number | null {
  const raw = process.env.LLM_DAILY_SPEND_CAP_USD;
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's (UTC) recorded Anthropic spend for a user, in USD. 0 if no row. */
export async function todaysLlmSpendUsd(userId: string): Promise<number> {
  const rows = await db
    .select({ spend: dailyUsageTable.anthropicSpendUsd })
    .from(dailyUsageTable)
    .where(
      and(
        eq(dailyUsageTable.userId, userId),
        eq(dailyUsageTable.date, todayUtc()),
      ),
    )
    .limit(1);
  // anthropic_spend_usd is a numeric column → the driver returns a string.
  const raw = rows[0]?.spend;
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Throw `DailyLlmCapExceededError` if today's spend already meets/exceeds the
 * cap. No-op when the cap is disabled. Call this BEFORE incurring LLM spend.
 *
 * Note: this is a best-effort pre-check, not a hard transactional reservation.
 * Concurrent in-flight generations can still overshoot the cap slightly (each
 * reads spend before either has written its increment). That is acceptable for
 * a cost guardrail — it bounds runaway loops without the complexity of a
 * reserve-then-settle ledger.
 */
export async function assertUnderDailyLlmCap(userId: string): Promise<void> {
  const cap = dailyLlmSpendCapUsd();
  if (cap == null) return;
  const spent = await todaysLlmSpendUsd(userId);
  if (spent >= cap) {
    throw new DailyLlmCapExceededError(spent, cap);
  }
}
