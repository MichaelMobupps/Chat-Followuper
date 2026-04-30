import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-client-react";

export type CurrentUserState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated"; user: null }
  | { status: "error"; user: null; error: Error };

/**
 * Wraps the generated /api/auth/me hook and exposes a discriminated state.
 * 401 is treated as "unauthenticated", not as an error.
 */
export function useCurrentUser(): CurrentUserState & {
  refetch: () => void;
} {
  const query = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 2;
      },
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const refetch = () => {
    void query.refetch();
  };

  if (query.isLoading) {
    return { status: "loading", user: null, refetch };
  }
  if (query.error) {
    if (query.error instanceof ApiError && query.error.status === 401) {
      return { status: "unauthenticated", user: null, refetch };
    }
    return {
      status: "error",
      user: null,
      error: query.error as Error,
      refetch,
    };
  }
  if (query.data) {
    return { status: "authenticated", user: query.data, refetch };
  }
  return { status: "unauthenticated", user: null, refetch };
}
