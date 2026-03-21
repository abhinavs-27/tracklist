import { fetcher } from "./api";

export type ResolvedLogTarget = {
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
};

/**
 * Logs are always stored per track. For album/artist picks we use the first
 * track from the album / top tracks (same UX as contextual “log listen”).
 */
export async function resolveTrackForSearchResult(
  kind: "artist" | "album" | "track",
  id: string,
): Promise<ResolvedLogTarget | null> {
  if (kind === "track") {
    return { trackId: id };
  }
  if (kind === "album") {
    const data = await fetcher<{
      tracks: Array<{ id: string }>;
      album: { artist_id?: string | null };
    }>(`/api/albums/${encodeURIComponent(id)}`);
    const t = data.tracks?.[0];
    if (!t?.id) return null;
    return {
      trackId: t.id,
      albumId: id,
      artistId: data.album?.artist_id ?? null,
    };
  }
  const data = await fetcher<{
    topTracks: Array<{ id: string }>;
    artist: { id: string };
  }>(`/api/artists/${encodeURIComponent(id)}`);
  const t = data.topTracks?.[0];
  if (!t?.id) return null;
  return { trackId: t.id, artistId: data.artist.id };
}
