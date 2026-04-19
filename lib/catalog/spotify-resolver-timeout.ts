import "server-only";

/**
 * Spotify GET (album/track/artist) inside catalog resolver.
 * Default 20s — 5s was too tight for dev (token refresh, Bottleneck queue, cold starts).
 * Override: SPOTIFY_RESOLVER_NETWORK_TIMEOUT_MS
 */
export function spotifyResolverNetworkTimeoutMs(): number {
  const raw = process.env.SPOTIFY_RESOLVER_NETWORK_TIMEOUT_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 20_000;
  return Number.isFinite(n) && n >= 5_000 ? n : 20_000;
}

/**
 * Full `getOrCreateEntity` (network + DB upserts). Must exceed Spotify timeout + insert work.
 * Override: SPOTIFY_RESOLVER_ROUTE_TIMEOUT_MS
 */
export function spotifyResolverRouteTimeoutMs(): number {
  const raw = process.env.SPOTIFY_RESOLVER_ROUTE_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 10_000) return n;
  }
  return spotifyResolverNetworkTimeoutMs() + 35_000;
}
