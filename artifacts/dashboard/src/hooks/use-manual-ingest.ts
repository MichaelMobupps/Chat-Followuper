/**
 * Manual ingest hooks — Ticket 2.7-FE.
 *
 * Query for settings (toggle state), mutation for the PATCH toggle, and
 * mutation for the POST ingest action. Invalidates the follow-ups list on
 * a successful ingest so the new prospect shows up in the main table on
 * its next refresh.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  getManualIngestSettings,
  getPrepareProgress,
  getPreviewProgress,
  patchManualIngestSettings,
  postClassifySeed,
  postManualIngest,
  postManualIngestBulk,
  postPrepareFirstMessage,
  postPreviewFirstMessage,
  type PreviewFirstMessageInput,
  type PreviewFirstMessageResult,
  type ClassifiedSeed,
  type ClassifySeedInput,
  type ManualIngestBulkInput,
  type ManualIngestBulkResponse,
  type ManualIngestCreateInput,
  type ManualIngestProspect,
  type ManualIngestSettings,
  type ManualIngestToggleInput,
  type PrepareFirstMessageInput,
  type PrepareFirstMessageResult,
  type PrepareProgress,
} from "@/lib/api/manual-ingest";
import { ApiError } from "@/lib/api";

export const manualIngestSettingsKey = ["manual-ingest-settings"] as const;

export function useManualIngestSettings(): UseQueryResult<
  ManualIngestSettings,
  ApiError
> {
  return useQuery<ManualIngestSettings, ApiError>({
    queryKey: manualIngestSettingsKey,
    queryFn: () => getManualIngestSettings(),
  });
}

export function useToggleManualIngest(): UseMutationResult<
  ManualIngestSettings,
  ApiError,
  ManualIngestToggleInput
> {
  const qc = useQueryClient();
  return useMutation<ManualIngestSettings, ApiError, ManualIngestToggleInput>({
    mutationFn: (input) => patchManualIngestSettings(input),
    onSuccess: (data) => {
      qc.setQueryData(manualIngestSettingsKey, data);
    },
  });
}

export function useAddManualContact(): UseMutationResult<
  ManualIngestProspect,
  ApiError,
  ManualIngestCreateInput
> {
  const qc = useQueryClient();
  return useMutation<ManualIngestProspect, ApiError, ManualIngestCreateInput>({
    mutationFn: (input) => postManualIngest(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["followups"] });
      void qc.invalidateQueries({ queryKey: ["prospects-list"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Ticket 2.8-FE — bulk manual ingest mutation.
//
// Invalidates the follow-ups list only when at least one row landed.
// Empty-accepted responses (full rejection) leave caches alone so the UI
// doesn't bounce.
// ─────────────────────────────────────────────────────────────────────────

export function usePrepareFirstMessage(): UseMutationResult<
  PrepareFirstMessageResult,
  ApiError,
  { prospectId: string; input?: PrepareFirstMessageInput }
> {
  const qc = useQueryClient();
  return useMutation<
    PrepareFirstMessageResult,
    ApiError,
    { prospectId: string; input?: PrepareFirstMessageInput }
  >({
    mutationFn: ({ prospectId, input }) =>
      postPrepareFirstMessage(prospectId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prospects-list"] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase H — prepare-progress polling.
//
// Polls while `prospectId` is set AND the run hasn't reached a terminal
// stage (ready/error). Pass null to stop polling entirely (query disabled).
// 1.2s interval: fast enough for a live-feeling bar, slow enough to be
// negligible load (the endpoint is an in-memory map read).
// ─────────────────────────────────────────────────────────────────────────

export function usePrepareProgress(
  prospectId: string | null,
  opts?: { running?: boolean },
): UseQueryResult<PrepareProgress, ApiError> {
  const running = opts?.running ?? false;
  // Keeping the poller alive stops the bar FREEZING on a stale terminal entry;
  // suppressing the stale FRAME itself is useFreshProgress's job at the call
  // site (masking here would mean spreading React Query's tracked-result proxy,
  // which permanently degrades prop tracking to notifyOnChangeProps:"all" —
  // #trackedProps is add-only — and re-renders the 50-row table on every poll).
  return useQuery<PrepareProgress, ApiError>({
    queryKey: ["prepare-progress", prospectId],
    queryFn: () => getPrepareProgress(prospectId!),
    enabled: prospectId !== null,
    refetchInterval: (query) => {
      const stage = query.state.data?.stage;
      // Repeated fetch failures — stop rather than hammer a broken endpoint.
      if (query.state.errorUpdateCount >= 3) return false;
      // AUDIT [High] — while the POST is in flight, a terminal stage can only
      // be a STALE entry from an earlier run of this same prospect: the server
      // parks ready/error for a 15-min TTL, and our GET can reach it before the
      // POST does (resetQueries refetches synchronously, whereas mutateAsync
      // defers its fetch by a microtask — so the POST-then-reset source order
      // does NOT put the POST on the wire first). Believing that entry stopped
      // the poller dead for the whole run: a frozen 100% "Ready" bar under a
      // "Writing your first message…" title on every Regenerate, and the
      // previous failure's red bar through every retry. Keep polling while the
      // caller says a run is live — the route stamps "queued" as its first act,
      // so the bar self-corrects within one interval instead of freezing.
      if (running) return 1200;
      if (stage === "ready" || stage === "error") return false;
      // "idle" = no run registered server-side. Allow a grace window for the
      // just-fired POST to write its "queued" entry (the first GET can race
      // it), then stop: a rejected POST, a mid-run server restart (in-memory
      // store wiped), or a TTL-expired entry would otherwise leave this
      // polling every 1.2s for as long as the page stays mounted.
      if (stage === "idle" && query.state.dataUpdateCount >= 10) return false;
      return 1200;
    },
    // Progress is instantaneous state — never serve a stale cache entry
    // from a previous run of the same prospect.
    gcTime: 0,
    staleTime: 0,
  });
}

export function useAddManualContactsBulk(): UseMutationResult<
  ManualIngestBulkResponse,
  ApiError,
  ManualIngestBulkInput
> {
  const qc = useQueryClient();
  return useMutation<ManualIngestBulkResponse, ApiError, ManualIngestBulkInput>({
    mutationFn: (input) => postManualIngestBulk(input),
    onSuccess: (data) => {
      if (data.accepted.length > 0) {
        // E1: BulkAddDialog now lives on the Contacts page (F-E moved it there),
        // whose table reads ["prospects-list"]. Invalidating only ["followups"]
        // left the Contacts list stale after a paste — it looked like a silent
        // drop, and re-pasting then bounced off duplicate_phone. Invalidate both
        // (the single-add hook above already does).
        void qc.invalidateQueries({ queryKey: ["prospects-list"] });
        void qc.invalidateQueries({ queryKey: ["followups"] });
      }
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Seed → classify (ask-less onboarding). No cache side-effects — the caller
// reads the returned classification to pre-fill a form.
// ─────────────────────────────────────────────────────────────────────────

export function useClassifySeed(): UseMutationResult<
  { classified: ClassifiedSeed },
  ApiError,
  ClassifySeedInput
> {
  return useMutation<{ classified: ClassifiedSeed }, ApiError, ClassifySeedInput>({
    mutationFn: (input) => postClassifySeed(input),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Preview ("Generate message" in the Add dialog) — no prospect exists yet, so
// the run is keyed by a client-generated draftId. No cache side-effects: the
// caller reads the message into a textarea, and the create call claims the
// server-side draft by id.
// ─────────────────────────────────────────────────────────────────────────

export function usePreviewFirstMessage(): UseMutationResult<
  PreviewFirstMessageResult,
  ApiError,
  PreviewFirstMessageInput
> {
  return useMutation<PreviewFirstMessageResult, ApiError, PreviewFirstMessageInput>({
    mutationFn: (input) => postPreviewFirstMessage(input),
  });
}

/**
 * Same polling contract as usePrepareProgress, including the `running` escape —
 * a draftId is fresh per run so a stale terminal entry is unlikely, but the
 * server still parks ready/error for 15 minutes and a retried draftId would hit
 * the identical race. Cheaper to be consistent than to reason about why not.
 */
export function usePreviewProgress(
  draftId: string | null,
  opts?: { running?: boolean },
): UseQueryResult<PrepareProgress, ApiError> {
  const running = opts?.running ?? false;
  return useQuery<PrepareProgress, ApiError>({
    queryKey: ["preview-progress", draftId],
    queryFn: () => getPreviewProgress(draftId!),
    enabled: draftId !== null,
    refetchInterval: (query) => {
      const stage = query.state.data?.stage;
      if (query.state.errorUpdateCount >= 3) return false;
      if (running) return 1200;
      if (stage === "ready" || stage === "error") return false;
      if (stage === "idle" && query.state.dataUpdateCount >= 10) return false;
      return 1200;
    },
    gcTime: 0,
    staleTime: 0,
  });
}
