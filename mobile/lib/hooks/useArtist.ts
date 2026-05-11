import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { AlbumStats } from "./useAlbum";

export type ArtistSummary = {
  id: string;
  name: string;
  image_url: string | null;
  followers: number | null;
  genres: string[];
};

export type ArtistAlbumGridItem = {
  id: string;
  name: string;
  artist: string;
  artwork_url: string | null;
  release_date: string | null;
};

export type ArtistTrackItem = {
  id: string;
  name: string;
  track_number: number;
  duration_ms: number | null;
  listen_count: number;
  review_count: number;
  average_rating: number | null;
  artwork_url: string | null;
};

export type ArtistReviewItem = {
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

export type ArtistCommunityStats = {
  totalPlays: number;
  avgRating: number | null;
  albumCount: number;
};

export type ArtistViewerStats = {
  playCount: number;
  topAlbumName: string | null;
  topAlbumId: string | null;
  firstListened: string | null;
};

type ArtistApiResponse = {
  artist: ArtistSummary;
  albums: ArtistAlbumGridItem[];
  topTracks: ArtistTrackItem[];
  stats: AlbumStats;
  communityStats?: ArtistCommunityStats;
  reviews?: ArtistReviewItem[];
};

export type ArtistAlbumItem = {
  id: string;
  name: string;
  artist: string;
  artwork_url: string | null;
  listen_count: number;
  average_rating: number | null;
};

type ArtistAlbumsApiResponse = {
  artistName: string;
  artistImageUrl: string | null;
  albums: ArtistAlbumItem[];
};

export function useArtistAllAlbums(artistId: string) {
  return useQuery({
    queryKey: [...queryKeys.artist(artistId), "albums"],
    queryFn: () => fetcher<ArtistAlbumsApiResponse>(`/api/artists/${encodeURIComponent(artistId)}/albums`),
    enabled: !!artistId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useArtist(artistId: string) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.artist(artistId),
    queryFn: () => fetcher<ArtistApiResponse>(`/api/artists/${encodeURIComponent(artistId)}`),
    enabled: !!artistId,
    staleTime: 5 * 60 * 1000,
  });

  const stats = data?.stats ?? ({
    average_rating: null, play_count: 0, favorite_count: 0, review_count: 0,
  } satisfies AlbumStats);

  return {
    artist: data?.artist ? { ...data.artist, genres: data.artist.genres ?? [] } : null,
    albums: data?.albums ?? [],
    topTracks: data?.topTracks ?? [],
    reviews: data?.reviews ?? [],
    stats,
    communityStats: data?.communityStats ?? null,
    isLoading,
    error,
  };
}
