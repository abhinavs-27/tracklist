import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { fetcher } from "../api";

export type LeaderboardType = "popular" | "topRated" | "mostFavorited";
export type LeaderboardEntity = "song" | "album";

export type LeaderboardEntry = {
  id: string;
  rank: number;
  title: string;
  artist: string;
  artworkUrl: string | null;
};

export type LeaderboardFilters = {
  startYear?: number;
  endYear?: number;
  entity?: LeaderboardEntity;
};

type LeaderboardPage = {
  items: LeaderboardEntry[];
  nextCursor: number | null;
};

async function fetchLeaderboardPage(
  type: LeaderboardType,
  filters: LeaderboardFilters,
  entity: LeaderboardEntity,
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

  return fetcher<LeaderboardPage>(`/api/leaderboard?${params.toString()}`);
}

export function useLeaderboard(
  type: LeaderboardType,
  filters: LeaderboardFilters,
  entity: LeaderboardEntity,
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

