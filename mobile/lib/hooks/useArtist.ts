import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { AlbumStats, AlbumTrack } from "./useAlbum";

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

type ArtistApiResponse = {
  artist: ArtistSummary;
  albums: ArtistAlbumGridItem[];
  topTracks: AlbumTrack[];
  stats: AlbumStats;
};

async function loadArtist(artistId: string): Promise<ArtistApiResponse> {
  return fetcher<ArtistApiResponse>(
    `/api/artists/${encodeURIComponent(artistId)}`,
  );
}

export function useArtist(artistId: string) {
  const key = queryKeys.artist(artistId);

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => loadArtist(artistId),
    enabled: !!artistId,
    staleTime: 30 * 1000,
  });

  const stats =
    data?.stats ??
    ({
      average_rating: null,
      play_count: 0,
      favorite_count: 0,
      review_count: 0,
    } satisfies AlbumStats);

  const artist = data?.artist
    ? {
        ...data.artist,
        genres: data.artist.genres ?? [],
      }
    : null;

  return {
    artist,
    albums: data?.albums ?? [],
    topTracks: data?.topTracks ?? [],
    stats,
    isLoading,
    error,
  };
}
