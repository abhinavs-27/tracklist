import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";

export type AlbumHeader = {
  id: string;
  name: string;
  artist: string;
  /** Optional Spotify primary artist id for navigation. */
  artist_id: string | null;
  artwork_url: string | null;
  release_date: string | null;
};

export type AlbumTrack = {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number | null;
  listen_count: number;
  review_count: number;
  average_rating: number | null;
};

export type AlbumStats = {
  average_rating: number | null;
  play_count: number;
  favorite_count: number;
  review_count: number;
  rating_distribution: Record<string, number> | null;
};

export type ReviewItem = {
  id: string;
  user_id?: string;
  username: string | null;
  rating: number;
  review_text: string | null;
  created_at?: string;
  avatar_url?: string | null;
};

type AlbumApiResponse = {
  album: AlbumHeader & { artist_id?: string | null };
  tracks: AlbumTrack[];
  stats: AlbumStats;
  reviews?: {
    items: ReviewItem[];
  };
};

export function useAlbum(albumId: string) {
  const key = queryKeys.album(albumId);

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () =>
      fetcher<AlbumApiResponse>(`/api/albums/${encodeURIComponent(albumId)}`),
    enabled: !!albumId,
    staleTime: 5 * 60 * 1000,
  });

  const raw = data?.album ?? null;
  const album = raw
    ? {
        ...raw,
        artist_id: raw.artist_id ?? null,
      }
    : null;
  const tracks = data?.tracks ?? [];
  const stats =
    data?.stats ?? ({
      average_rating: null,
      play_count: 0,
      favorite_count: 0,
      review_count: 0,
      rating_distribution: null,
    } satisfies AlbumStats);
  const reviews = data?.reviews?.items ?? [];

  return { album, tracks, stats, reviews, isLoading, error };
}

type MyReviewResponse = {
  my_review: { id: string; rating: number; review_text: string | null } | null;
};

export function useMyAlbumReview(albumId: string) {
  return useQuery({
    queryKey: ["my-album-review", albumId],
    queryFn: () =>
      fetcher<MyReviewResponse>(`/api/albums/${encodeURIComponent(albumId)}/my-review`),
    enabled: !!albumId,
    staleTime: 60_000,
    select: (d) => d.my_review ?? null,
  });
}

