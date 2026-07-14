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
  patchManualIngestSettings,
  postClassifySeed,
  postManualIngest,
  postManualIngestBulk,
  postPrepareFirstMessage,
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
): UseQueryResult<PrepareProgress, ApiError> {
  return useQuery<PrepareProgress, ApiError>({
    queryKey: ["prepare-progress", prospectId],
    queryFn: () => getPrepareProgress(prospectId!),
    enabled: prospectId !== null,
    refetchInterval: (query) => {
      const stage = query.state.data?.stage;
      if (stage === "ready" || stage === "error") return false;
      // Repeated fetch failures — stop rather than hammer a broken endpoint.
      if (query.state.errorUpdateCount >= 3) return false;
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
