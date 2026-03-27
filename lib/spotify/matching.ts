/**
 * Lightweight Spotify search result pickers (enrichment worker).
 * Heavy Last.fm → Spotify scoring lives in `lib/lastfm/map-to-spotify.ts`.
 */

export function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function pickBestArtistMatch(
  name: string,
  candidates: SpotifyApi.ArtistObjectFull[] | SpotifyApi.ArtistObjectSimplified[],
): SpotifyApi.ArtistObjectFull | SpotifyApi.ArtistObjectSimplified | null {
  if (!candidates?.length) return null;
  const n = normalizeForMatch(name);
  const exact = candidates.find((c) => normalizeForMatch(c.name) === n);
  return exact ?? candidates[0] ?? null;
}

export function pickBestTrackMatch(
  trackName: string,
  artistName: string,
  candidates: SpotifyApi.TrackObjectFull[],
): SpotifyApi.TrackObjectFull | null {
  if (!candidates?.length) return null;
  const nt = normalizeForMatch(trackName);
  const na = normalizeForMatch(artistName);
  const exact = candidates.find(
    (c) =>
      normalizeForMatch(c.name) === nt &&
      (c.artists ?? []).some((a) => normalizeForMatch(a.name) === na),
  );
  return exact ?? candidates[0] ?? null;
}
