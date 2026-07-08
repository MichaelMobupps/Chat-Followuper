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
 * The daily bucket is the user's LOCAL day (DB7): `usageBucketDate(digestTimezone)`,
 * matching the writers in the three call sites (generateMessage /
 * manualContactPrepare / followupMessageService), which now derive the bucket
 * the same way. This keeps read aligned with write AND resets the cap at the
 * user's midnight instead of UTC midnight (~02:00–03:00 local).
 */

import { and, eq, sql } from "drizzle-orm";
import { db, dailyUsageTable, usersTable } from "@workspace/db";
import { usageBucketDate } from "./usageBucket";

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

/** The user's local-day bucket date (DB7). Falls back to UTC if no user/tz. */
async function userBucketDate(userId: string): Promise<string> {
  const rows = await db
    .select({ tz: usersTable.digestTimezone })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return usageBucketDate(rows[0]?.tz);
}

/** Today's (user-local-day) recorded Anthropic spend for a user, in USD. 0 if no row. */
export async function todaysLlmSpendUsd(userId: string): Promise<number> {
  const bucket = await userBucketDate(userId);
  const rows = await db
    .select({ spend: dailyUsageTable.anthropicSpendUsd })
    .from(dailyUsageTable)
    .where(
      and(
        eq(dailyUsageTable.userId, userId),
        eq(dailyUsageTable.date, bucket),
      ),
    )
    .limit(1);
  // anthropic_spend_usd is a numeric column → the driver returns a string.
  const raw = rows[0]?.spend;
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Record `costUsd` of Anthropic spend into the user's local-day bucket — the
 * SAME bucket `assertUnderDailyLlmCap` reads, so spend the cap must eventually
 * see can't land in a different row. Spend-only (does not bump
 * messagesGenerated), so it's safe for non-message LLM work like prospector
 * discovery / research. Best-effort by design at the non-transactional call
 * sites (L1/L2): a failure here is an accounting under-count, never a broken
 * user flow — callers should `.catch(log)` it.
 */
export async function recordDailyLlmSpend(
  userId: string,
  costUsd: number,
): Promise<void> {
  if (!(costUsd > 0)) return;
  const bucket = await userBucketDate(userId);
  await db
    .insert(dailyUsageTable)
    .values({ userId, date: bucket, anthropicSpendUsd: costUsd.toFixed(4) })
    .onConflictDoUpdate({
      target: [dailyUsageTable.userId, dailyUsageTable.date],
      set: {
        anthropicSpendUsd: sql`${dailyUsageTable.anthropicSpendUsd} + CAST(${costUsd.toFixed(4)} AS numeric)`,
      },
    });
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
