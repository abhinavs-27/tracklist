/**
 * Logs are always stored per track. For album/artist picks we use a representative
 * track (first on album, or top track for artist) and label the toast clearly.
 */
export type ResolvedLogTarget = {
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
  /** Use for success copy so users see the actual track, not only the search row title. */
  displayNameForLog?: string;
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
        tracks: Array<{ id: string; name: string }>;
        album: { artist_id?: string | null; name?: string };
      }>(`/api/albums/${encodeURIComponent(id)}`);
      const t = data.tracks?.[0];
      if (!t?.id) return null;
      const albumName = data.album?.name?.trim() || "Album";
      return {
        trackId: t.id,
        albumId: id,
        artistId: data.album?.artist_id ?? null,
        displayNameForLog: `${t.name} · ${albumName}`,
      };
    }
    const data = await fetchJson<{
      topTracks: Array<{ id: string; name: string }>;
      artist: { id: string; name?: string };
    }>(`/api/artists/${encodeURIComponent(id)}`);
    const t = data.topTracks?.[0];
    if (!t?.id) return null;
    const artistName = data.artist?.name?.trim() || "Artist";
    return {
      trackId: t.id,
      artistId: data.artist.id,
      displayNameForLog: `${t.name} · ${artistName}`,
    };
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
