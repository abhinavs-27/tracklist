import "server-only";

/**
 * Controls whether getOrFetch* helpers may call Spotify on cache miss / stale refresh.
 *
 * - Default (no env, opts.allowNetwork unset): **never** call Spotify from catalog reads — DB / placeholders only.
 * - Set `SPOTIFY_NETWORK_FOR_CATALOG_READS=1` on worker/cron processes that hydrate catalog.
 * - Or pass `{ allowNetwork: true }` for explicit warm paths (e.g. after Spotify user sync).
 */
export type CatalogFetchOpts = {
  allowLastfmMapping?: boolean;
  /** When true, allow Spotify API for this call regardless of env. */
  allowNetwork?: boolean;
};

export function catalogReadsAllowSpotifyNetwork(
  opts?: CatalogFetchOpts,
): boolean {
  if (opts?.allowNetwork === true) return true;
  return process.env.SPOTIFY_NETWORK_FOR_CATALOG_READS === "1";
}
