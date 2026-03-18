import { useQuery } from "@tanstack/react-query";
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
  favorite_count?: number;
};

type LeaderboardResponse = {
  items: LeaderboardEntryFromApi[];
  nextCursor: number | null;
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

export function useLeaderboard(params: UseLeaderboardParams) {
  const entity = typeToBackendEntity[params.type];
  const backendType = metricToBackendType[params.metric];

  const key = queryKeys.leaderboard(backendType, {
    startYear: params.startYear,
    endYear: params.endYear,
    entity,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => {
      // Note: backend uses `type` for the metric and `entity` for songs/albums.
      // We keep your hook signature (`type`=songs|albums, `metric`=popular|top_rated|favorited)
      // by mapping them here.
      const qp = new URLSearchParams({
        type: backendType,
        entity,
        metric: params.metric,
      });
      if (params.startYear != null) qp.set("startYear", String(params.startYear));
      if (params.endYear != null) qp.set("endYear", String(params.endYear));

      return fetcher<LeaderboardResponse>(`/api/leaderboard?${qp.toString()}`);
    },
    staleTime: 60 * 1000,
  });

  const items: LeaderboardItem[] =
    data?.items.map((e) => ({
      id: e.id,
      entityType: e.entity_type,
      title: e.name,
      artist: e.artist,
      artworkUrl: e.artwork_url,
      rating: e.average_rating,
      playCount: e.total_plays,
      favoriteCount: e.favorite_count,
    })) ?? [];

  return { data: items, isLoading, error };
}

