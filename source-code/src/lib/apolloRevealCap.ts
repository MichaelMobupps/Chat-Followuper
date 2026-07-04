/**
 * Per-user monthly Apollo reveal cap (audit findings APO1 / API3).
 *
 * Before the audit, `/apollo/reveal` and `/apollo/request-phone-reveal`
 * incremented `daily_usage.apollo_reveals_used` and the read-only
 * `/users/me/apollo-usage` endpoint advertised a `revealCap` / `remaining` /
 * `capExceeded` — but nothing ever compared usage to the cap BEFORE calling
 * Apollo. Each reveal burns real Apollo credits (~8 for a phone reveal); a tight
 * loop could drain the account with the advertised cap doing nothing.
 *
 * This module centralizes the cap, the month-bounds math, and the usage read so
 * the reporting endpoint and the enforcement path can't drift, and adds a
 * pre-call assert the reveal routes invoke before spending.
 *
 * The cap defaults to 100/month (matching the previously advertised value) and
 * is configurable via `APOLLO_MONTHLY_REVEAL_CAP`. Unlike the LLM spend cap this
 * one is always on — the reporting endpoint already promised it, so enforcing it
 * makes the promise real rather than introducing a new limit.
 *
 * Bucket is UTC month, matching the existing reporting endpoint. (Audit DB7's
 * UTC-vs-local concern applies to all daily_usage accounting and is out of scope
 * here — this deliberately matches the existing reader.)
 *
 * APO4 (counter semantics — decided: this is a REVEAL QUOTA, not a credit
 * budget). Every phone reveal (sync `/apollo/reveal` and async
 * `/apollo/request-phone-reveal`) increments the counter by exactly 1, which is
 * correct and consistent — and keeps `daily_usage.apollo_reveals_used` a true
 * reveal COUNT for the weekly/admin reporting that reads it. It is deliberately
 * NOT re-scaled into credits (which would silently change the column's meaning
 * and 8× the effective limit). Operators sizing the cap should know the credit
 * implication: 1 reveal ≈ `APOLLO_CREDITS_PER_PHONE_REVEAL` Apollo credits, so a
 * 100-reveal cap ≈ 800 credits/month. A separate credit budget, if ever wanted,
 * belongs in its own counter rather than overloading this one.
 */

import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, dailyUsageTable } from "@workspace/db";

/**
 * Apollo credits consumed by a single phone reveal. Reference value for
 * operators reasoning about the reveal quota in credit terms (see module note);
 * the counter itself stays a reveal count.
 */
export const APOLLO_CREDITS_PER_PHONE_REVEAL = 8;

/**
 * Thrown when the user has already used their monthly reveal allowance.
 * Mapped to HTTP 429 `apollo_reveal_cap_exceeded` by the terminal error handler.
 */
export class ApolloRevealCapExceededError extends Error {
  constructor(
    readonly used: number,
    readonly cap: number,
  ) {
    super("apollo_reveal_cap_exceeded");
    this.name = "ApolloRevealCapExceededError";
  }
}

/** Monthly reveal cap. Defaults to 100; `APOLLO_MONTHLY_REVEAL_CAP` overrides. */
export function apolloMonthlyRevealCap(): number {
  const raw = Number(process.env.APOLLO_MONTHLY_REVEAL_CAP ?? 100);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
}

/** First and last day (inclusive) of the current UTC month, as YYYY-MM-DD. */
export function monthBoundsUtc(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/** Sum of `apollo_reveals_used` for the user across the current UTC month. */
export async function monthlyApolloRevealsUsed(userId: string): Promise<number> {
  const { start, end } = monthBoundsUtc();
  const rows = await db
    .select({
      total: sql<string>`COALESCE(SUM(${dailyUsageTable.apolloRevealsUsed}), 0)`,
    })
    .from(dailyUsageTable)
    .where(
      and(
        eq(dailyUsageTable.userId, userId),
        gte(dailyUsageTable.date, start),
        lte(dailyUsageTable.date, end),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Throw `ApolloRevealCapExceededError` if the user has met/exceeded the monthly
 * reveal cap. Call BEFORE spending an Apollo reveal credit.
 *
 * Best-effort pre-check, not a transactional reservation: concurrent in-flight
 * reveals can overshoot slightly. Acceptable for a credit guardrail — it bounds
 * runaway loops without a reserve-then-settle ledger.
 */
export async function assertUnderApolloRevealCap(userId: string): Promise<void> {
  const cap = apolloMonthlyRevealCap();
  const used = await monthlyApolloRevealsUsed(userId);
  if (used >= cap) {
    throw new ApolloRevealCapExceededError(used, cap);
  }
}
