import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  listProspects,
  type ListProspectsParams,
  type ListProspectsResponse,
} from "@/lib/api/prospects";

/**
 * Tanstack Query hook for the prospects list. Uses keepPreviousData so
 * the table doesn't flash empty between filter/page transitions.
 *
 * Cache key includes all params; tweaking any filter triggers a refetch
 * for that specific combination (and keeps prior data visible during it).
 */
export function useProspectsList(params: ListProspectsParams) {
  return useQuery<ListProspectsResponse, ApiError>({
    queryKey: ["prospects-list", params],
    queryFn: () => listProspects(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
