/**
 * Sequence config hooks — Ticket 2.5-FE.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  getSequenceConfig,
  patchSequenceConfig,
  type SequenceConfig,
  type SequenceConfigPatch,
} from "@/lib/api/sequence-config";
import { ApiError } from "@/lib/api";

export const sequenceConfigKey = ["sequence-config"] as const;

export function useSequenceConfig(): UseQueryResult<SequenceConfig, ApiError> {
  return useQuery<SequenceConfig, ApiError>({
    queryKey: sequenceConfigKey,
    queryFn: () => getSequenceConfig(),
  });
}

export function usePatchSequenceConfig(): UseMutationResult<
  SequenceConfig,
  ApiError,
  SequenceConfigPatch
> {
  const qc = useQueryClient();
  return useMutation<SequenceConfig, ApiError, SequenceConfigPatch>({
    mutationFn: (input) => patchSequenceConfig(input),
    onSuccess: (data) => {
      qc.setQueryData(sequenceConfigKey, data);
      // Followups list shows maxFollowups in row derived data; refetch.
      void qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });
}
