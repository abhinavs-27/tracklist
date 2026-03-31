/**
 * Heuristic: Last.fm–sourced cover art URLs vs Spotify CDN.
 * Used to optionally refresh album rows toward Spotify artwork (low priority / cron).
 */
export function isLikelyLastfmHostedAlbumImageUrl(
  url: string | null | undefined,
): boolean {
  if (!url?.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host.includes("scdn.co") ||
    host.includes("spotifycdn.com") ||
    host.includes("spotify.com")
  ) {
    return false;
  }
  if (host.includes("lastfm") || host.includes("audioscrobbler")) {
    return true;
  }
  /** Last.fm image CDN (hostname contains lastfm). */
  if (host.endsWith("freetls.fastly.net") && host.includes("lastfm")) {
    return true;
  }
  return false;
}
