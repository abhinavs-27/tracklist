import type { LastfmImportEntry } from "./types";

/** Default: skip same track if another listen within this window (ms). */
export const DEFAULT_SCROBBLE_DEDUP_MS = 120_000;

/**
 * Remove listens that are too close in time for the same Spotify track (import batch).
 * Sorts by time ascending and keeps the first play in each window per track.
 */
export function dedupeImportBatchByTimeWindow<T extends LastfmImportEntry>(
  entries: T[],
  windowMs: number = DEFAULT_SCROBBLE_DEDUP_MS,
): T[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.listenedAt).getTime() - new Date(b.listenedAt).getTime(),
  );
  const out: T[] = [];
  const lastTimeByTrack = new Map<string, number>();

  for (const e of sorted) {
    const t = new Date(e.listenedAt).getTime();
    if (Number.isNaN(t)) continue;
    const prev = lastTimeByTrack.get(e.spotifyTrackId);
    if (prev !== undefined && t - prev < windowMs) continue;
    lastTimeByTrack.set(e.spotifyTrackId, t);
    out.push(e);
  }
  return out;
}
