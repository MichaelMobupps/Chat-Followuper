import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  archiveCampaign,
  unarchiveCampaign,
  deleteCampaign,
  type Campaign,
  type CampaignDetail,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from "@/lib/api/campaigns";

/**
 * Query key factory. Mirrors the structure used elsewhere in the codebase
 * (see `getGetCurrentUserQueryKey()` from @workspace/api-client-react)
 * but defined locally since campaigns aren't in the codegen scope.
 */
export const campaignsKeys = {
  all: () => ["campaigns"] as const,
  lists: () => [...campaignsKeys.all(), "list"] as const,
  list: (includeArchived: boolean) =>
    [...campaignsKeys.lists(), { includeArchived }] as const,
  details: () => [...campaignsKeys.all(), "detail"] as const,
  detail: (id: string) => [...campaignsKeys.details(), id] as const,
};

const DEFAULT_RETRY = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status === 401) return false;
  return failureCount < 2;
};

const DETAIL_RETRY = (failureCount: number, error: unknown) => {
  if (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 404)
  )
    return false;
  return failureCount < 2;
};

export function useCampaigns(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery<Campaign[], ApiError>({
    queryKey: campaignsKeys.list(includeArchived),
    queryFn: () => listCampaigns({ includeArchived }),
    retry: DEFAULT_RETRY,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useCampaign(
  id: string | null | undefined,
  options?: Partial<UseQueryOptions<CampaignDetail, ApiError>>,
) {
  return useQuery<CampaignDetail, ApiError>({
    queryKey: campaignsKeys.detail(id ?? "__none__"),
    queryFn: () => getCampaign(id as string),
    enabled: Boolean(id),
    retry: DETAIL_RETRY,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation<Campaign, ApiError, CreateCampaignInput>({
    mutationFn: createCampaign,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: campaignsKeys.lists() });
    },
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation<
    Campaign,
    ApiError,
    { id: string; input: UpdateCampaignInput }
  >({
    mutationFn: ({ id, input }) => updateCampaign(id, input),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: campaignsKeys.lists() });
      void qc.invalidateQueries({ queryKey: campaignsKeys.detail(data.id) });
    },
  });
}

export function useArchiveCampaign() {
  const qc = useQueryClient();
  return useMutation<Campaign, ApiError, string>({
    mutationFn: archiveCampaign,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: campaignsKeys.lists() });
      void qc.invalidateQueries({ queryKey: campaignsKeys.detail(data.id) });
    },
  });
}

export function useUnarchiveCampaign() {
  const qc = useQueryClient();
  return useMutation<Campaign, ApiError, string>({
    mutationFn: unarchiveCampaign,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: campaignsKeys.lists() });
      void qc.invalidateQueries({ queryKey: campaignsKeys.detail(data.id) });
    },
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteCampaign,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: campaignsKeys.all() });
    },
  });
}
