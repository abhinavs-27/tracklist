"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { LeaderboardEntry, LeaderboardFilters } from "@/lib/queries";

export type { LeaderboardEntry, LeaderboardFilters } from "@/lib/queries";

type LeaderboardPage = {
  items: LeaderboardEntry[];
  nextCursor: number | null;
  total?: number;
};

async function fetchLeaderboardPage(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album",
  cursor: number | undefined,
): Promise<LeaderboardPage> {
  const params = new URLSearchParams({ type, entity });
  if (filters.startYear != null) {
    params.set("startYear", String(filters.startYear));
  }
  if (filters.endYear != null) {
    params.set("endYear", String(filters.endYear));
  }
  if (cursor && cursor > 0) {
    params.set("cursor", String(cursor));
  }
  const res = await fetch(`/api/leaderboard?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load leaderboard");
  const data = (await res.json()) as LeaderboardPage;
  return data;
}

export function useLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album",
) {
  const key = queryKeys.leaderboard(type, { ...filters, entity });
  const infiniteQuery = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      fetchLeaderboardPage(
        type,
        filters,
        entity,
        (pageParam as number | undefined) ?? 0,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: 0,
    staleTime: 60 * 1000,
  });

  const flatItems =
    infiniteQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    data: flatItems,
    isLoading: infiniteQuery.isLoading,
    error: infiniteQuery.error,
    fetchNextPage: infiniteQuery.fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
  };
}
