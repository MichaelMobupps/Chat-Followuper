import { and, eq, lt } from "drizzle-orm";
import {
  db,
  prospectsTable,
  actionLogsTable,
  ACTION_TYPES,
} from "@workspace/db";

const DEFAULT_MAX_AGE_HOURS = 72;
const LOG_BATCH_SIZE = 1000;

export interface ExpireStaleResult {
  expired: number;
  cutoffIso: string;
  maxAgeHours: number;
}

/**
 * Resolve the cutoff from env. Guards against an empty string (Number("")
 * is 0, which would expire freshly requested rows) and a typo (NaN).
 * Exported so the unit test can verify the clamp without a database.
 */
export function resolveMaxAgeHours(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_AGE_HOURS;
  }
  return parsed;
}

/**
 * Transition pending phone reveals older than maxAgeHours to the terminal
 * "expired" status. Idempotent. Only rows still in "pending" are touched,
 * so a re-run after the backlog clears is a no-op.
 *
 * Apollo's async reveal carries no delivery guarantee. When bulk_match finds
 * no direct dial, no webhook lands and the row stays "pending" indefinitely.
 * This sweep ends that state so the list shows the prospect as unreachable.
 *
 * "expired" is a SOFT terminal. processPhoneRevealCallback still accepts a
 * late delivery and promotes the row to "arrived", so credits already spent
 * are recoverable. The conservative default (72h) keeps that window wide.
 */
export async function expireStalePhoneReveals(
  maxAgeHours: number = resolveMaxAgeHours(
    process.env.REVEAL_PENDING_MAX_AGE_HOURS,
  ),
): Promise<ExpireStaleResult> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const updated = await db
    .update(prospectsTable)
    .set({
      phoneRevealStatus: "expired",
      phoneRevealCompletedAt: new Date(),
    })
    .where(
      and(
        eq(prospectsTable.phoneRevealStatus, "pending"),
        lt(prospectsTable.phoneRevealRequestedAt, cutoff),
      ),
    )
    .returning({
      id: prospectsTable.id,
      userId: prospectsTable.userId,
    });

  // Chunk the audit insert. The first production run clears the whole
  // backlog at once, and a single multi-row insert can exceed the Postgres
  // bind-parameter ceiling (around 13k rows at this column count).
  for (let i = 0; i < updated.length; i += LOG_BATCH_SIZE) {
    const slice = updated.slice(i, i + LOG_BATCH_SIZE);
    await db.insert(actionLogsTable).values(
      slice.map((row) => ({
        userId: row.userId,
        prospectId: row.id,
        actionType: ACTION_TYPES.apolloPhoneRevealExpired,
        actionStatus: "skipped" as const,
        metadata: { reason: "pending_reveal_timeout", maxAgeHours },
      })),
    );
  }

  return {
    expired: updated.length,
    cutoffIso: cutoff.toISOString(),
    maxAgeHours,
  };
}
