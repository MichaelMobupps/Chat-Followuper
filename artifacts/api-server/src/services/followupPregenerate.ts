/**
 * Hourly follow-up message PRE-generation (Speed pass, 2026-07-16).
 *
 * Before this pass existed, the pipeline was: cron notices a row is due →
 * email/Pushover fire ("you have N follow-ups due", no message text) → the rep
 * clicks → the writer chain (2–6 sequential LLM calls, tens of seconds to
 * minutes) runs WHILE THE REP STARES AT A REDIRECT. The docs already claimed
 * "a follow-up is due when it … has a generated message", but nothing ever
 * generated one ahead of time.
 *
 * Now the scheduler runs this FIRST, then the digests: due rows get their
 * message written and persisted here, the due queries in followupDigest /
 * pushoverDigest additionally require a generated message, and the rep's
 * click hits the cached-message short-circuit → instant deep link.
 *
 * Failure posture: a row whose generation fails simply isn't notified this
 * tick — it stays due and is retried next tick (the daily spend cap resets
 * overnight, so a capped user's queue drains the next morning). The overdue
 * escalation nudges (pushoverNudges) deliberately do NOT gate on a generated
 * message, so a row that keeps failing still surfaces to the rep after 2+
 * days rather than going silent forever; its open link generates on demand
 * exactly as before.
 */
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, followupsTable, prospectsTable, usersTable } from "@workspace/db";
import { CHANNEL_CODES } from "../lib/channelRegister";
import { DailyLlmCapExceededError } from "../lib/llmSpendCap";
import { senderNameFromUser } from "../lib/senderName";
import { logger } from "../lib/logger";
import { generateAndPersistFollowupMessage } from "./followupMessageService";

export interface PregenerateResult {
  due: number;
  generated: number;
  failed: number;
  /** Users whose remaining rows were skipped after a daily-cap hit. */
  usersCapped: number;
  /** Rows dropped by MAX_ROWS_PER_TICK (they retry next tick). */
  deferred: number;
}

// Bound one tick's LLM work: each generation is 2–6 sequential provider
// round-trips, so an unbounded backlog (e.g. first tick after a long outage)
// could hold the digests hostage for an hour. Deferred rows are counted and
// logged — never silently dropped — and the next tick picks them up.
const MAX_ROWS_PER_TICK = Number(process.env.FOLLOWUP_PREGEN_MAX_PER_TICK) || 25;

export async function pregenerateDueFollowupMessages(): Promise<PregenerateResult> {
  // Same due predicate as followupDigest.fetchDueRows / pushoverDigest, MINUS
  // the generated-message requirement those queries now add — this pass is
  // exactly the producer that satisfies it.
  const rows = await db
    .select({
      followupId: followupsTable.id,
      userId: prospectsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
    })
    .from(followupsTable)
    .innerJoin(prospectsTable, eq(followupsTable.prospectId, prospectsTable.id))
    .innerJoin(usersTable, eq(prospectsTable.userId, usersTable.id))
    .where(
      and(
        eq(followupsTable.status, "scheduled"),
        // F4/D2: exclude removed-channel (teams/slack) zombie rows — generation
        // throws invalid_channel on them, so attempting is a guaranteed failure.
        inArray(followupsTable.channel, [...CHANNEL_CODES]),
        isNull(followupsTable.sentAt),
        lte(followupsTable.scheduledAt, new Date()),
        eq(prospectsTable.followupPaused, false),
        eq(usersTable.followupsPaused, false),
        eq(prospectsTable.replied, 0),
        // Only rows that still need a message. btrim covers NULL (btrim(NULL)
        // IS NULL → condition false → excluded by the outer or-check), empty,
        // and whitespace-only bodies — the same shapes the cached-message
        // short-circuit treats as "not generated".
        or(
          isNull(followupsTable.generatedMessage),
          sql`btrim(${followupsTable.generatedMessage}) = ''`,
        ),
      ),
    )
    .orderBy(followupsTable.scheduledAt);

  const result: PregenerateResult = {
    due: rows.length,
    generated: 0,
    failed: 0,
    usersCapped: 0,
    deferred: Math.max(0, rows.length - MAX_ROWS_PER_TICK),
  };
  if (rows.length === 0) return result;
  if (result.deferred > 0) {
    logger.info(
      { due: rows.length, cap: MAX_ROWS_PER_TICK, deferred: result.deferred },
      "[followup-pregen] backlog exceeds per-tick cap; deferring the rest to the next tick",
    );
  }

  // Group by user so a daily-cap hit skips that USER's remaining rows (every
  // further attempt would just re-throw the same cap error) without touching
  // anyone else's queue. Users run sequentially, rows within a user
  // sequentially — generation is already 2–6 sequential LLM calls, and this
  // runs on the hourly tick where gentle beats fast.
  const byUser = new Map<string, typeof rows>();
  for (const row of rows.slice(0, MAX_ROWS_PER_TICK)) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  for (const [userId, list] of byUser) {
    for (const row of list) {
      try {
        await generateAndPersistFollowupMessage({
          followupId: row.followupId,
          userId,
          senderName: senderNameFromUser(row.userName, row.userEmail),
        });
        result.generated += 1;
      } catch (err) {
        if (err instanceof DailyLlmCapExceededError) {
          result.usersCapped += 1;
          result.failed += list.length - list.indexOf(row);
          logger.info(
            { userId, remaining: list.length - list.indexOf(row) },
            "[followup-pregen] daily cap reached; deferring user's remaining rows",
          );
          break;
        }
        result.failed += 1;
        logger.warn(
          { err: String(err), followupId: row.followupId, userId },
          "[followup-pregen] generation failed; row retries next tick",
        );
      }
    }
  }

  return result;
}
