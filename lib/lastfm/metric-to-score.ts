import { parseLastfmCount } from "./parse-count";

/**
 * Log scale for Last.fm listeners / playcount. Must be much larger than
 * `popularityFromPlayCount` in Hidden Gems (100k): those map **in-app** plays.
 * Last.fm stats are global — often 100k+ for mid-tier catalog, so using 100k
 * here made almost everything 100.
 */
const LASTFM_GLOBAL_REFERENCE = 50_000_000;

export function metricToPopularityScore(raw: number | null): number {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0;
  const c = Math.max(0, raw);
  const denom = Math.log(LASTFM_GLOBAL_REFERENCE + 1);
  const v = (Math.log(c + 1) / denom) * 100;
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** Prefer listeners; fall back to playcount when listeners is missing or zero. */
export function lastfmListenersOrPlaycountScore(
  listeners: unknown,
  playcount: unknown,
): number {
  const L = parseLastfmCount(listeners);
  const P = parseLastfmCount(playcount);
  const best =
    L != null && L > 0 ? L : P != null && P > 0 ? P : L ?? P ?? 0;
  return metricToPopularityScore(best > 0 ? best : null);
}
