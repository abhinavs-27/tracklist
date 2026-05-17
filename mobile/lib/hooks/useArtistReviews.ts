import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { CACHE_KEYS, readCache, writeCache } from "../persistent-cache";
import type { ArtistRecentListen } from "./useArtistRecentListens";

export type ArtistReview = {
  id: string;
  user_id: string;
  username: string | null;
  entity_type: "album" | "song";
  entity_id: string;
  entity_name: string | null;
  entity_image_url: string | null;
  rating: number;
  review_text: string | null;
  created_at: string;
  user: { id: string; username: string; avatar_url: string | null } | null;
};

export type ArtistViewerStats = {
  playCount: number;
  topAlbumName: string | null;
  topAlbumId: string | null;
  firstListened: string | null;
};

export function useArtistViewerStats(artistId: string) {
  return useQuery<ArtistViewerStats | null>({
    queryKey: ["artist-viewer-stats", artistId],
    queryFn: () =>
      fetcher<ArtistViewerStats | null>(
        `/api/artists/${encodeURIComponent(artistId)}/viewer-stats`,
      ),
    enabled: !!artistId,
    staleTime: 60_000,
    retry: false,
  });
}

export type ArtistLeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  playCount: number;
  isViewer: boolean;
};

export function useArtistReviews(artistId: string) {
  return useQuery<ArtistReview[]>({
    queryKey: ["artist-reviews", artistId],
    queryFn: () =>
      fetcher<ArtistReview[]>(`/api/artists/${encodeURIComponent(artistId)}/reviews?limit=6`),
    enabled: !!artistId,
    staleTime: 60_000,
  });
}

export function useArtistLeaderboard(artistId: string) {
  return useQuery<ArtistLeaderboardEntry[]>({
    queryKey: ["artist-leaderboard", artistId],
    queryFn: () =>
      fetcher<ArtistLeaderboardEntry[]>(
        `/api/artists/${encodeURIComponent(artistId)}/leaderboard`,
      ),
    enabled: !!artistId,
    staleTime: 60_000,
    retry: false,
  });
}

// ─── Artist detail bundle (1 request replaces viewer-stats + leaderboard + recent-listens + reviews) ───

export type ArtistDetailBundle = {
  viewerStats: ArtistViewerStats | null;
  recentListens: ArtistRecentListen[];
  leaderboard: ArtistLeaderboardEntry[];
  reviews: ArtistReview[];
};

export function useArtistDetailBundle(artistId: string) {
  const cacheKey = CACHE_KEYS.artistDetailBundle(artistId);
  const cached = readCache<ArtistDetailBundle>(cacheKey);

  return useQuery<ArtistDetailBundle>({
    queryKey: ["artist-detail-bundle", artistId],
    queryFn: async () => {
      const data = await fetcher<ArtistDetailBundle>(
        `/api/artists/${encodeURIComponent(artistId)}/detail-bundle`,
      );
      writeCache(cacheKey, data);
      return data;
    },
    initialData: cached ?? undefined,
    initialDataUpdatedAt: 0,
    enabled: !!artistId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
