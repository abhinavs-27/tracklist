import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { UserListSummary, UserListsApiResponse } from "../types/user-list";

export function useUserLists(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.userLists(userId ?? ""),
    queryFn: async () => {
      const body = await fetcher<UserListsApiResponse>(
        `/api/users/${encodeURIComponent(userId!)}/lists`,
      );
      return Array.isArray(body.lists) ? body.lists : [];
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  });
}

export type { UserListSummary };
