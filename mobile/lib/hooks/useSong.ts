import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";
import type { AlbumStats, ReviewItem } from "./useAlbum";

/** Album strip on song page (from /api/albums or Spotify fallback). */
export type SongAlbumContext = {
  id: string;
  name: string;
  artist: string;
  artwork_url: string | null;
};

/**
 * Spotify track payload from GET /api/spotify/song/:id
 * (There is no GET /api/songs/:id in the API without server changes; this hook composes existing routes.)
 */
export type SongDetail = {
  id: string;
  name: string;
  artist: string;
  /** Optional Spotify primary artist id for navigation. */
  artist_id: string | null;
  image_url: string | null;
  release_date: string | null;
  album_name: string | null;
  album_id: string | null;
};

type AlbumApiResponse = {
  album: {
    id: string;
    name: string;
    artist: string;
    artwork_url: string | null;
    release_date: string | null;
  };
  tracks: Array<{
    id: string;
    listen_count: number;
    review_count: number;
    average_rating: number | null;
  }>;
};

type ReviewsApiResponse = {
  reviews: Array<{
    id: string;
    username?: string | null;
    rating: number;
    review_text: string | null;
  }>;
  average_rating: number | null;
  count: number;
};

export type SongPageData = {
  song: SongDetail;
  album: SongAlbumContext | null;
  stats: AlbumStats;
  reviews: ReviewItem[];
};

async function loadSongPage(songId: string): Promise<SongPageData> {
  const spotify = await fetcher<SongDetail>(
    `/api/spotify/song/${encodeURIComponent(songId)}`,
  );

  const reviewsRes = await fetcher<ReviewsApiResponse>(
    `/api/reviews?entity_type=song&entity_id=${encodeURIComponent(
      songId,
    )}&limit=5`,
  );

  let albumContext: SongAlbumContext | null = null;
  let listenCount = 0;
  let trackReviewCount = 0;
  let trackAvg: number | null = null;

  if (spotify.album_id) {
    try {
      const albumData = await fetcher<AlbumApiResponse>(
        `/api/albums/${encodeURIComponent(spotify.album_id)}`,
      );
      const track = albumData.tracks?.find((t) => t.id === songId);
      if (track) {
        listenCount = track.listen_count ?? 0;
        trackReviewCount = track.review_count ?? 0;
        trackAvg = track.average_rating ?? null;
      }
      albumContext = {
        id: albumData.album.id,
        name: albumData.album.name,
        artist: albumData.album.artist,
        artwork_url: albumData.album.artwork_url,
      };
    } catch {
      if (spotify.album_id && spotify.album_name) {
        albumContext = {
          id: spotify.album_id,
          name: spotify.album_name,
          artist: spotify.artist,
          artwork_url: spotify.image_url,
        };
      }
    }
  }

  const reviewCount = reviewsRes.count ?? reviewsRes.reviews?.length ?? 0;
  const averageRating =
    reviewsRes.average_rating ?? trackAvg ?? null;

  const stats: AlbumStats = {
    average_rating: averageRating,
    play_count: listenCount,
    favorite_count: 0,
    review_count: reviewCount,
  };

  const reviews: ReviewItem[] = (reviewsRes.reviews ?? [])
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      username: r.username ?? null,
      rating: r.rating,
      review_text: r.review_text ?? null,
    }));

  return {
    song: {
      ...spotify,
      artist_id: spotify.artist_id ?? null,
    },
    album: albumContext,
    stats,
    reviews,
  };
}

export function useSong(songId: string) {
  const key = queryKeys.song(songId);

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => loadSongPage(songId),
    enabled: !!songId,
    staleTime: 30 * 1000,
  });

  return {
    song: data?.song ?? null,
    album: data?.album ?? null,
    stats:
      data?.stats ??
      ({
        average_rating: null,
        play_count: 0,
        favorite_count: 0,
        review_count: 0,
      } satisfies AlbumStats),
    reviews: data?.reviews ?? [],
    isLoading,
    error,
  };
}
