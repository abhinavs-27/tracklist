import { useInfiniteQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { FeedPageResponse } from "../types/feed";

const PAGE_SIZE = 20;

export function useFeed() {
  return useInfiniteQuery({
    queryKey: [...queryKeys.feed(), "infinite"] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (pageParam) params.set("cursor", pageParam);
      return fetcher<FeedPageResponse>(`/api/feed?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30 * 1000,
  });
}
