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
  patchManualIngestSettings,
  postManualIngest,
  postManualIngestBulk,
  postPrepareFirstMessage,
  type ManualIngestBulkInput,
  type ManualIngestBulkResponse,
  type ManualIngestCreateInput,
  type ManualIngestProspect,
  type ManualIngestSettings,
  type ManualIngestToggleInput,
  type PrepareFirstMessageInput,
  type PrepareFirstMessageResult,
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
        void qc.invalidateQueries({ queryKey: ["followups"] });
      }
    },
  });
}
