import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";

export type LeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  playCount: number;
  isViewer: boolean;
};

function useLeaderboard(key: readonly unknown[], url: string, enabled: boolean) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: key,
    queryFn: () => fetcher<LeaderboardEntry[]>(url),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useArtistLeaderboard(artistId: string, loggedIn: boolean) {
  return useLeaderboard(
    queryKeys.artistLeaderboard(artistId),
    `/api/artists/${encodeURIComponent(artistId)}/leaderboard`,
    !!artistId && loggedIn,
  );
}

export function useAlbumLeaderboard(albumId: string, loggedIn: boolean) {
  return useLeaderboard(
    queryKeys.albumLeaderboard(albumId),
    `/api/albums/${encodeURIComponent(albumId)}/leaderboard`,
    !!albumId && loggedIn,
  );
}

export function useSongLeaderboard(songId: string, loggedIn: boolean) {
  return useLeaderboard(
    queryKeys.songLeaderboard(songId),
    `/api/songs/${encodeURIComponent(songId)}/leaderboard`,
    !!songId && loggedIn,
  );
}
