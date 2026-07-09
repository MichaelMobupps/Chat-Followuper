/**
 * Prepare-first-message progress tracking (Phase H, 2026-07).
 *
 * The Contacts page shows a staged progress bar while a first message is
 * being auto-generated. Stages are REAL pipeline checkpoints (not a fake
 * timer): prepareFirstMessage() reports each transition here and the FE
 * polls GET /api/prospects/:id/prepare-progress (~1.2s) while a run is
 * active.
 *
 * Storage is an in-memory Map — deliberately NOT the database:
 *   - progress is ephemeral UX state, gone stale within a minute;
 *   - the generation request and the polling requests hit the same
 *     single-process API server (Replit autoscale runs one instance per
 *     machine; sticky within a deploy);
 *   - worst case after a process restart the FE simply sees "no progress"
 *     and falls back to its request-in-flight spinner state.
 *
 * Keys are `${userId}:${prospectId}` so a tenant can never read another
 * tenant's progress even if a route-level ownership check regressed.
 * Entries expire after TTL_MS via lazy sweep on every read/write.
 */

export type PrepareStage =
  | "queued"       // request accepted, pipeline not started yet
  | "researching"  // company research (LLM) in flight
  | "writing"      // writer → critic → lint chain in flight
  | "finalizing"   // persisting message + usage, building deep link
  | "ready"        // done — message available
  | "error";       // failed — `error` carries a short reason code

export interface PrepareProgressEntry {
  stage: PrepareStage;
  /** Coarse completion percentage for the bar width. */
  pct: number;
  startedAt: number;
  updatedAt: number;
  /** Short machine-readable reason when stage === "error". */
  error?: string;
}

const STAGE_PCT: Record<PrepareStage, number> = {
  queued: 5,
  researching: 30,
  writing: 65,
  finalizing: 90,
  ready: 100,
  error: 100,
};

const TTL_MS = 15 * 60 * 1000;

const progress = new Map<string, PrepareProgressEntry>();

function key(userId: string, prospectId: string): string {
  return `${userId}:${prospectId}`;
}

function sweep(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of progress) {
    if (v.updatedAt < cutoff) progress.delete(k);
  }
}

export function setPrepareProgress(
  userId: string,
  prospectId: string,
  stage: PrepareStage,
  error?: string,
): void {
  sweep();
  const k = key(userId, prospectId);
  const existing = progress.get(k);
  const now = Date.now();
  progress.set(k, {
    stage,
    pct: STAGE_PCT[stage],
    startedAt:
      // A new run (queued) restarts the clock; mid-run transitions keep it.
      stage === "queued" || !existing ? now : existing.startedAt,
    updatedAt: now,
    ...(error ? { error } : {}),
  });
}

export function getPrepareProgress(
  userId: string,
  prospectId: string,
): PrepareProgressEntry | null {
  sweep();
  return progress.get(key(userId, prospectId)) ?? null;
}

/** Test hook. */
export function __clearPrepareProgressForTests(): void {
  progress.clear();
}
