import "server-only";

/**
 * Controls whether getOrFetch* helpers may call Spotify on cache miss / stale refresh.
 *
 * - `{ allowNetwork: false }` — never call Spotify (DB / placeholders only), regardless of env.
 * - `{ allowNetwork: true }` — allow Spotify for this call.
 * - Default (unset): `SPOTIFY_NETWORK_FOR_CATALOG_READS=1` enables network (e.g. worker/cron hydration).
 */
export type CatalogFetchOpts = {
  allowLastfmMapping?: boolean;
  /** When true, allow Spotify API for this call regardless of env. */
  allowNetwork?: boolean;
};

export function catalogReadsAllowSpotifyNetwork(
  opts?: CatalogFetchOpts,
): boolean {
  if (opts?.allowNetwork === false) return false;
  if (opts?.allowNetwork === true) return true;
  return process.env.SPOTIFY_NETWORK_FOR_CATALOG_READS === "1";
}
