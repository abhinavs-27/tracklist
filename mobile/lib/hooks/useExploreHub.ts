import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  readStaleSessionCache,
  writeStaleSessionCache,
} from "@repo/lib/client/stale-session-cache";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type {
  ExploreDiscoverPayload,
  ExploreHubLeaderboardEntry,
  ExploreHubResponse,
  ExploreHubTrendingItem,
  ExploreReviewPreviewRow,
} from "../types/explore-hub";

const EXPLORE_HUB_CACHE_KEY = "explore:hub";

const STALE_MS = 60 * 1000;

export function useExploreHub() {
  const initial = readStaleSessionCache<ExploreHubResponse>(EXPLORE_HUB_CACHE_KEY);

  const trendingQ = useQuery({
    queryKey: queryKeys.exploreTrending(),
    queryFn: () =>
      fetcher<{ trending: ExploreHubTrendingItem[] }>("/api/explore/trending"),
    staleTime: STALE_MS,
    initialData: initial
      ? { trending: initial.trending }
      : undefined,
  });

  const leaderboardQ = useQuery({
    queryKey: queryKeys.exploreLeaderboard(),
    queryFn: () =>
      fetcher<{ leaderboard: ExploreHubLeaderboardEntry[] }>(
        "/api/explore/leaderboard",
      ),
    staleTime: STALE_MS,
    initialData: initial
      ? { leaderboard: initial.leaderboard }
      : undefined,
  });

  const discoverQ = useQuery<ExploreDiscoverPayload>({
    queryKey: queryKeys.exploreDiscover(),
    queryFn: () => fetcher<ExploreDiscoverPayload>("/api/explore/discover"),
    staleTime: STALE_MS,
    initialData: initial?.discover,
  });

  const reviewsQ = useQuery({
    queryKey: queryKeys.exploreReviews(),
    queryFn: () =>
      fetcher<{ reviews: ExploreReviewPreviewRow[] }>("/api/explore/reviews"),
    staleTime: STALE_MS,
    initialData:
      initial?.reviews != null ? { reviews: initial.reviews } : undefined,
  });

  const data = useMemo((): ExploreHubResponse | undefined => {
    const hasTrending =
      trendingQ.data !== undefined && trendingQ.data !== null;
    const hasLeaderboard =
      leaderboardQ.data !== undefined && leaderboardQ.data !== null;
    if (!hasTrending && !hasLeaderboard && !initial) return undefined;

    return {
      trending: trendingQ.data?.trending ?? initial?.trending ?? [],
      leaderboard: leaderboardQ.data?.leaderboard ?? initial?.leaderboard ?? [],
      discover: discoverQ.data ?? initial?.discover,
      reviews: reviewsQ.data?.reviews ?? initial?.reviews,
    };
  }, [
    trendingQ.data,
    leaderboardQ.data,
    discoverQ.data,
    reviewsQ.data,
    initial,
  ]);

  useEffect(() => {
    if (!data) return;
    if (trendingQ.isSuccess && leaderboardQ.isSuccess) {
      writeStaleSessionCache(EXPLORE_HUB_CACHE_KEY, data);
    }
  }, [data, trendingQ.isSuccess, leaderboardQ.isSuccess]);

  const refetch = async () => {
    await Promise.all([
      trendingQ.refetch(),
      leaderboardQ.refetch(),
      discoverQ.refetch(),
      reviewsQ.refetch(),
    ]);
  };

  const isPending =
    !initial &&
    trendingQ.isPending &&
    leaderboardQ.isPending &&
    !trendingQ.data &&
    !leaderboardQ.data;

  const isError =
    trendingQ.isError &&
    leaderboardQ.isError &&
    !initial &&
    !trendingQ.data &&
    !leaderboardQ.data;

  return {
    data,
    isPending,
    isError,
    refetch,
    trendingQuery: trendingQ,
    leaderboardQuery: leaderboardQ,
    discoverQuery: discoverQ,
    reviewsQuery: reviewsQ,
  };
}
