/**
 * Prefetch-on-press helpers.
 *
 * Call the returned function inside `onPressIn` on any Pressable that
 * navigates to an album/artist/song/profile page. The finger-down →
 * finger-up gap (~100-200ms) plus the navigation transition (~200ms)
 * gives the fetch a ~300-400ms head start before the screen renders.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetcher } from "../api";
import { queryKeys } from "../query-keys";

const STALE_5MIN = 5 * 60 * 1000;
const STALE_2MIN = 2 * 60 * 1000;

export function usePrefetchAlbum() {
  const qc = useQueryClient();
  return useCallback(
    (albumId: string) => {
      if (!albumId) return;
      void qc.prefetchQuery({
        queryKey: queryKeys.album(albumId),
        queryFn: () => fetcher(`/api/albums/${encodeURIComponent(albumId)}`),
        staleTime: STALE_5MIN,
      });
      void qc.prefetchQuery({
        queryKey: ["album-social-bundle", albumId],
        queryFn: () => fetcher(`/api/albums/${encodeURIComponent(albumId)}/social-bundle`),
        staleTime: STALE_2MIN,
      });
    },
    [qc],
  );
}

export function usePrefetchArtist() {
  const qc = useQueryClient();
  return useCallback(
    (artistId: string) => {
      if (!artistId) return;
      void qc.prefetchQuery({
        queryKey: queryKeys.artist(artistId),
        queryFn: () => fetcher(`/api/artists/${encodeURIComponent(artistId)}`),
        staleTime: STALE_5MIN,
      });
      void qc.prefetchQuery({
        queryKey: ["artist-detail-bundle", artistId],
        queryFn: () => fetcher(`/api/artists/${encodeURIComponent(artistId)}/detail-bundle`),
        staleTime: STALE_5MIN,
      });
    },
    [qc],
  );
}

export function usePrefetchSong() {
  const qc = useQueryClient();
  return useCallback(
    (songId: string) => {
      if (!songId) return;
      void qc.prefetchQuery({
        queryKey: queryKeys.song(songId),
        queryFn: () => fetcher(`/api/songs/${encodeURIComponent(songId)}`),
        staleTime: STALE_5MIN,
      });
    },
    [qc],
  );
}

export function usePrefetchProfile() {
  const qc = useQueryClient();
  return useCallback(
    (username: string) => {
      if (!username) return;
      void qc.prefetchQuery({
        queryKey: queryKeys.profile(username),
        queryFn: () => fetcher(`/api/users/${encodeURIComponent(username)}`),
        staleTime: 3 * 60 * 1000,
      });
    },
    [qc],
  );
}
