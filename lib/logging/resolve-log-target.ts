/**
 * Logs are always stored per track. For album/artist picks we use the first
 * track from the album / top tracks (same UX as contextual “log listen”).
 */
export type ResolvedLogTarget = {
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
};

/** Same-origin `fetch` + JSON; throws when `!res.ok` (use with mobile `fetcher` too). */
export async function webFetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function resolveTrackForSearchResult(
  kind: "artist" | "album" | "track",
  id: string,
  fetchJson: <T>(path: string) => Promise<T>,
): Promise<ResolvedLogTarget | null> {
  try {
    if (kind === "track") {
      return { trackId: id };
    }
    if (kind === "album") {
      const data = await fetchJson<{
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
    const data = await fetchJson<{
      topTracks: Array<{ id: string }>;
      artist: { id: string };
    }>(`/api/artists/${encodeURIComponent(id)}`);
    const t = data.topTracks?.[0];
    if (!t?.id) return null;
    return { trackId: t.id, artistId: data.artist.id };
  } catch {
    return null;
  }
}

/** Browser / Next.js: same-origin API routes. */
export async function resolveTrackForSearchResultWeb(
  kind: "artist" | "album" | "track",
  id: string,
): Promise<ResolvedLogTarget | null> {
  return resolveTrackForSearchResult(kind, id, webFetchJson);
}
