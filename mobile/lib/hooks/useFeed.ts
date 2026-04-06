import { useInfiniteQuery } from "@tanstack/react-query";
import { readStaleSessionCache, writeStaleSessionCache } from "@repo/lib/client/stale-session-cache";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { FeedPageResponse } from "../types/feed";

const PAGE_SIZE = 20;
const FEED_FIRST_PAGE_CACHE_KEY = "feed:first-page";

export function useFeed() {
  const initialFirstPage = readStaleSessionCache<FeedPageResponse>(
    FEED_FIRST_PAGE_CACHE_KEY,
  );

  return useInfiniteQuery({
    queryKey: [...queryKeys.feed(), "infinite"] as const,
    initialPageParam: null as string | null,
    initialData:
      initialFirstPage != null
        ? { pages: [initialFirstPage], pageParams: [null] }
        : undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (pageParam) params.set("cursor", pageParam);
      const page = await fetcher<FeedPageResponse>(
        `/api/feed?${params.toString()}`,
      );
      if (!pageParam) {
        writeStaleSessionCache(FEED_FIRST_PAGE_CACHE_KEY, page);
      }
      return page;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
  });
}
