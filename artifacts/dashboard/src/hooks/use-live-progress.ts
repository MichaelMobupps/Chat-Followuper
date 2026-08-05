/**
 * useFreshProgress — suppress a STALE terminal progress frame.
 *
 * Both staged progress bars (prepare-first-message on Contacts, send-next on
 * the follow-up page) poll a server-side in-memory store that PARKS its
 * terminal entry (stage "ready"/"error") for a 15-minute TTL
 * (services/prepareProgress.ts). When a new run starts for the same id, the
 * first GET can read that stale entry, because the GET is dispatched before the
 * POST: `resetQueries` refetches SYNCHRONOUSLY, while `mutateAsync` defers its
 * fetch by a microtask (it awaits `onMutate` first). No amount of source
 * reordering changes that — this was measured against query-core, not assumed.
 *
 * Two symptoms followed, both on the retry/regenerate paths where the bar
 * matters most:
 *   1. the poller stopped dead (refetchInterval returns false on terminal), so
 *      the bar FROZE for the whole run — handled in the query hooks by polling
 *      unconditionally while `running`;
 *   2. the stale frame still RENDERED — a green "Ready 100%" flash at the start
 *      of every regenerate, and the previous failure's red "Failed — …" bar
 *      through every retry. That's this hook.
 *
 * Rule: while a run is live, ignore a terminal frame until the run has shown
 * something fresh. Once it has, pass everything through — so the run's REAL
 * "ready" (which lands while `running` is still true, just before the POST
 * resolves) is never suppressed and the bar can't blink out at the finish.
 *
 * `runKey` resets the flag when the poller switches target, so the invariant is
 * structural rather than resting on the UI gates that happen to prevent two
 * overlapping runs today.
 */
import { useRef } from "react";

/** Any staged-progress payload; both stores share the stage vocabulary. */
interface StagedProgress {
  stage: string;
}

export function useFreshProgress<T extends StagedProgress>(
  raw: T | undefined,
  running: boolean,
  runKey: string | number | null,
): T | undefined {
  const sawFresh = useRef(false);
  const lastKey = useRef<string | number | null>(null);

  // Both writes are pure functions of the render's inputs, so a double-render
  // is idempotent and a discarded concurrent render can only re-derive the
  // same value.
  if (!running || lastKey.current !== runKey) {
    sawFresh.current = false;
    lastKey.current = runKey;
  }

  const terminal = raw?.stage === "ready" || raw?.stage === "error";
  if (running && raw && !terminal) sawFresh.current = true;

  return running && terminal && !sawFresh.current ? undefined : raw;
}
