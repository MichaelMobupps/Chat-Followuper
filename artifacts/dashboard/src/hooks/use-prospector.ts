import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import {
  resolveUrls,
  type ResolveUrlsInput,
  type ResolveUrlsResponse,
} from "@/lib/api/prospector";

export function useResolveUrls() {
  return useMutation<ResolveUrlsResponse, ApiError, ResolveUrlsInput>({
    mutationFn: resolveUrls,
  });
}
