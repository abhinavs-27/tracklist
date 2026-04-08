import { useInfiniteQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { fetcher } from "../api";

export type LeaderboardTypeInput = "songs" | "albums";
export type LeaderboardMetricInput = "popular" | "top_rated" | "favorited";

export type LeaderboardItem = {
  id: string;
  entityType: "song" | "album";
  title: string;
  artist: string;
  artworkUrl: string | null;
  rating: number | null;
  playCount: number;
  favoriteCount?: number;
};

type LeaderboardEntryFromApi = {
  id: string;
  entity_type: "song" | "album";
  name: string;
  artist: string;
  artwork_url: string | null;
  total_plays: number;
  average_rating: number | null;
  favorite_count?: number | null;
  /** Some gateways may camelCase JSON */
  favoriteCount?: number | null;
};

type LeaderboardResponse = {
  items: LeaderboardEntryFromApi[];
  nextCursor: number | null;
  /** Total rows when server uses DB RPC (global popular / top rated). */
  total?: number;
};

export type UseLeaderboardParams = {
  type: LeaderboardTypeInput;
  metric: LeaderboardMetricInput;
  startYear?: number;
  endYear?: number;
};

const metricToBackendType = {
  popular: "popular",
  top_rated: "topRated",
  favorited: "mostFavorited",
} as const satisfies Record<LeaderboardMetricInput, "popular" | "topRated" | "mostFavorited">;

const typeToBackendEntity = {
  albums: "album",
  songs: "song",
} as const satisfies Record<LeaderboardTypeInput, "album" | "song">;

function mapEntry(
  e: LeaderboardEntryFromApi,
  metric: LeaderboardMetricInput,
): LeaderboardItem {
  const favRaw = e.favorite_count ?? e.favoriteCount;
  const favoriteCount =
    metric === "favorited"
      ? Number(favRaw ?? 0)
      : favRaw != null
        ? Number(favRaw)
        : undefined;
  return {
    id: e.id,
    entityType: e.entity_type,
    title: e.name,
    artist: e.artist,
    artworkUrl: e.artwork_url,
    rating: e.average_rating,
    playCount: Number(e.total_plays ?? 0),
    favoriteCount,
  };
}

export function useLeaderboard(params: UseLeaderboardParams) {
  const entity = typeToBackendEntity[params.type];
  const backendType = metricToBackendType[params.metric];

  const key = queryKeys.leaderboard(backendType, {
    startYear: params.startYear,
    endYear: params.endYear,
    entity,
  });

  const infiniteQuery = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => {
      const qp = new URLSearchParams({
        type: backendType,
        entity,
      });
      if (params.startYear != null) qp.set("startYear", String(params.startYear));
      if (params.endYear != null) qp.set("endYear", String(params.endYear));
      const cursor = pageParam as number | undefined;
      if (cursor && cursor > 0) qp.set("cursor", String(cursor));
      return fetcher<LeaderboardResponse>(`/api/leaderboard?${qp.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: 0,
    staleTime: 60 * 1000,
  });

  const items: LeaderboardItem[] =
    infiniteQuery.data?.pages.flatMap((page) =>
      page.items.map((e) => mapEntry(e, params.metric)),
    ) ?? [];

  return {
    data: items,
    isLoading: infiniteQuery.isLoading,
    error: infiniteQuery.error,
    refetch: infiniteQuery.refetch,
    fetchNextPage: infiniteQuery.fetchNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
  };
}
