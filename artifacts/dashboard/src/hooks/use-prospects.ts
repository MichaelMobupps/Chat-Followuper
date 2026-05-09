import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  createProspect,
  deleteProspect,
  getProspect,
  updateProspect,
  type CreateProspectInput,
  type Prospect,
  type UpdateProspectInput,
} from "@/lib/api/prospects";
import {
  generateMessage,
  type GenerateMessageResult,
} from "@/lib/api/seeder";

export const prospectsKeys = {
  all: () => ["prospects"] as const,
  details: () => [...prospectsKeys.all(), "detail"] as const,
  detail: (id: string) => [...prospectsKeys.details(), id] as const,
};

const DETAIL_RETRY = (failureCount: number, error: unknown) => {
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 404)
  )
    return false;
  return failureCount < 2;
};

export function useProspect(id: string | null | undefined) {
  return useQuery<Prospect, ApiError>({
    queryKey: prospectsKeys.detail(id ?? "__none__"),
    queryFn: () => getProspect(id as string),
    enabled: Boolean(id),
    retry: DETAIL_RETRY,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateProspect() {
  const qc = useQueryClient();
  return useMutation<Prospect, ApiError, CreateProspectInput>({
    mutationFn: createProspect,
    onSuccess: (data) => {
      qc.setQueryData(prospectsKeys.detail(data.id), data);
    },
  });
}

export function useUpdateProspect() {
  const qc = useQueryClient();
  return useMutation<
    Prospect,
    ApiError,
    { id: string; input: UpdateProspectInput }
  >({
    mutationFn: ({ id, input }) => updateProspect(id, input),
    onSuccess: (data) => {
      qc.setQueryData(prospectsKeys.detail(data.id), data);
    },
  });
}

export function useDeleteProspect() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteProspect,
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: prospectsKeys.detail(id) });
    },
  });
}

export function useGenerateMessage() {
  const qc = useQueryClient();
  return useMutation<GenerateMessageResult, ApiError, string>({
    mutationFn: generateMessage,
    onSuccess: (_, prospectId) => {
      // The route handler persists firstMessageBody on the prospect,
      // so invalidate the detail cache to pick up the new state.
      void qc.invalidateQueries({
        queryKey: prospectsKeys.detail(prospectId),
      });
    },
  });
}
