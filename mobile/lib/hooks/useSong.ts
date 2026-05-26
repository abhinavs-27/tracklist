import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { AlbumStats, ReviewItem } from "./useAlbum";

export type SongDetail = {
  id: string;
  canonical_id: string;
  name: string;
  artist: string;
  artist_id: string | null;
  duration_ms: number | null;
  track_number: number | null;
  image_url: string | null;
  release_date: string | null;
  album_name: string | null;
  album_id: string | null;
};

export type RecentListenItem = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  listened_at: string;
};

export type RecommendedTrack = {
  id: string;
  canonical_id: string;
  name: string;
  artist: string;
  image_url: string | null;
  album_name: string | null;
  album_id: string | null;
  listen_count: number;
  average_rating: number | null;
};

type SongApiResponse = {
  song: SongDetail;
  stats: AlbumStats & { rating_distribution: Record<string, number> | null };
  reviews: {
    items: ReviewItem[];
    average_rating: number | null;
    count: number;
    my_review: { id: string; rating: number; review_text: string | null } | null;
  };
  recent_listens: RecentListenItem[];
  recommended: RecommendedTrack[];
};

export type SongInfoData = {
  producers: { id: string; name: string }[];
  songwriters: { id: string; name: string }[];
  featuring: { id: string; name: string }[];
  samples: any[];
  sampledBy: any[];
  covers: any[];
};

export function useSongInfo(songId: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["song-info", songId],
    queryFn: () => fetcher<SongInfoData>(`/api/songs/${encodeURIComponent(songId)}/info`),
    enabled: !!songId,
    staleTime: 10 * 60 * 1000,
  });
  return {
    producers: data?.producers ?? [],
    songwriters: data?.songwriters ?? [],
    featuring: data?.featuring ?? [],
    samples: data?.samples ?? [],
    sampledBy: data?.sampledBy ?? [],
    covers: data?.covers ?? [],
    isLoading,
  };
}

export function useSong(songId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.song(songId),
    queryFn: () => fetcher<SongApiResponse>(`/api/songs/${encodeURIComponent(songId)}`),
    enabled: !!songId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    song: data?.song ?? null,
    stats: data?.stats ?? {
      average_rating: null, play_count: 0, favorite_count: 0,
      review_count: 0, rating_distribution: null,
    },
    reviews: data?.reviews?.items ?? [],
    myReview: data?.reviews?.my_review ?? null,
    reviewStats: data?.reviews
      ? { average_rating: data.reviews.average_rating, count: data.reviews.count }
      : null,
    recentListens: data?.recent_listens ?? [],
    recommended: data?.recommended ?? [],
    isLoading,
    error,
  };
}
