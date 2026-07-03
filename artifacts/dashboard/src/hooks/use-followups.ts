/**
 * Followups tanstack-query hooks — Ticket 2.5-FE.
 *
 * Cache key pattern: ["followups", { channel, status, page, perPage }]
 * On every mutation the entire ["followups"] subtree is invalidated.
 * That's coarser than strictly needed but is correct (no stale rows)
 * and fast enough for the row volumes we expect pre-launch.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  archiveProspect,
  bulkArchiveFollowups,
  bulkPauseProspects,
  listFollowups,
  markProspectReplied,
  patchFollowup,
  snoozeFollowup,
  sendNextFollowup,
  type SnoozePreset,
  type ArchiveProspectResponse,
  type BulkArchiveInput,
  type BulkArchiveResponse,
  type BulkPauseInput,
  type BulkPauseResponse,
  type Followup,
  type FollowupListResponse,
  type ListFollowupsArgs,
  type ListStatus,
  type MarkRepliedResponse,
  type PatchFollowupInput,
  type SendNextFollowupResponse,
  type SupportedChannel,
} from "@/lib/api/followups";
import { ApiError } from "@/lib/api";

export function followupsListKey(args: ListFollowupsArgs) {
  return [
    "followups",
    {
      channel: args.channel,
      status: args.status ?? "all",
      page: args.page ?? 1,
      perPage: args.perPage ?? 25,
    },
  ] as const;
}

export function useListFollowups(
  args: ListFollowupsArgs,
): UseQueryResult<FollowupListResponse, ApiError> {
  return useQuery<FollowupListResponse, ApiError>({
    queryKey: followupsListKey(args),
    queryFn: () => listFollowups(args),
  });
}

function useInvalidateFollowups() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["followups"] });
}

export function useSendNextFollowup(): UseMutationResult<
  SendNextFollowupResponse,
  ApiError,
  { prospectId: string; channel: SupportedChannel }
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<
    SendNextFollowupResponse,
    ApiError,
    { prospectId: string; channel: SupportedChannel }
  >({
    mutationFn: ({ prospectId, channel }) =>
      sendNextFollowup(prospectId, channel),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useSnoozeFollowup(): UseMutationResult<
  { followup: Followup; scheduledAt: string },
  ApiError,
  { followupId: number; preset: SnoozePreset }
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<
    { followup: Followup; scheduledAt: string },
    ApiError,
    { followupId: number; preset: SnoozePreset }
  >({
    mutationFn: ({ followupId, preset }) => snoozeFollowup(followupId, preset),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function usePatchFollowup(): UseMutationResult<
  { followup: Followup },
  ApiError,
  { followupId: number; input: PatchFollowupInput }
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<
    { followup: Followup },
    ApiError,
    { followupId: number; input: PatchFollowupInput }
  >({
    mutationFn: ({ followupId, input }) => patchFollowup(followupId, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useBulkArchiveFollowups(): UseMutationResult<
  BulkArchiveResponse,
  ApiError,
  BulkArchiveInput
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<BulkArchiveResponse, ApiError, BulkArchiveInput>({
    mutationFn: (input) => bulkArchiveFollowups(input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useMarkProspectReplied(): UseMutationResult<
  MarkRepliedResponse,
  ApiError,
  { prospectId: string; repliedAt?: string }
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<
    MarkRepliedResponse,
    ApiError,
    { prospectId: string; repliedAt?: string }
  >({
    mutationFn: ({ prospectId, repliedAt }) =>
      markProspectReplied(prospectId, repliedAt),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useArchiveProspect(): UseMutationResult<
  ArchiveProspectResponse,
  ApiError,
  { prospectId: string }
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<
    ArchiveProspectResponse,
    ApiError,
    { prospectId: string }
  >({
    mutationFn: ({ prospectId }) => archiveProspect(prospectId),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useBulkPauseProspects(): UseMutationResult<
  BulkPauseResponse,
  ApiError,
  BulkPauseInput
> {
  const invalidate = useInvalidateFollowups();
  return useMutation<BulkPauseResponse, ApiError, BulkPauseInput>({
    mutationFn: (input) => bulkPauseProspects(input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

// Re-export the status enum so consumers don't need both imports.
export type { ListStatus };
