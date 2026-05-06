import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";

export type ArtistRecentListen = {
  id: string;
  track_id: string;
  track_name: string | null;
  album_id: string | null;
  album_name: string | null;
  album_image: string | null;
  listened_at: string;
  user: { id: string; username: string; avatar_url: string | null } | null;
};

export function useArtistRecentListens(artistId: string) {
  return useQuery<ArtistRecentListen[]>({
    queryKey: ["artist-recent-listens", artistId],
    queryFn: () =>
      fetcher<ArtistRecentListen[]>(
        `/api/artists/${encodeURIComponent(artistId)}/recent-listens`,
      ),
    enabled: !!artistId,
    staleTime: 60_000,
    retry: false,
  });
}
