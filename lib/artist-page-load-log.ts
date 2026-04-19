import "server-only";

/**
 * Server logs for `/artist/[id]` load phases (timings; if a phase logs only `start`, it never settled).
 *
 * - `TRACKLIST_DEBUG_ARTIST_PAGE=1` — log for every artist
 * - `TRACKLIST_DEBUG_ARTIST_PAGE_IDS` — comma-separated canonical artist UUIDs (e.g. one URL you are debugging)
 * - `ARTIST_ALBUMS_SYNC_DEBUG=1` — verbose `[artist-albums-sync]` when scheduling `sync_artist_discography` (RSC is DB-only; Spotify runs in queue)
 */
const TAG = "[artist-page-load]";

function artistIdInDebugList(artistId: string): boolean {
  const raw = process.env.TRACKLIST_DEBUG_ARTIST_PAGE_IDS?.trim();
  if (!raw) return false;
  const ids = raw.split(",").map((s) => s.trim().toLowerCase());
  return ids.includes(artistId.trim().toLowerCase());
}

export function isArtistPageDebugEnabled(artistId?: string): boolean {
  if (process.env.TRACKLIST_DEBUG_ARTIST_PAGE === "1") return true;
  if (artistId && artistIdInDebugList(artistId)) return true;
  return false;
}

/** Server-only breadcrumbs inside {@link getOrFetchArtistInner} (spotify-cache). */
export function logArtistFetchInner(
  artistId: string,
  msg: string,
  extra?: Record<string, unknown>,
): void {
  if (!isArtistPageDebugEnabled(artistId)) return;
  console.log(TAG, "getOrFetchArtistInner", msg, { artistId, ...extra });
}

export function artistPagePhaseStart(phase: string, artistId: string): number {
  const t0 = Date.now();
  console.log(TAG, phase, "start", { artistId, t0 });
  return t0;
}

export function artistPagePhaseEnd(
  phase: string,
  artistId: string,
  t0: number,
  extra?: Record<string, unknown>,
): void {
  console.log(TAG, phase, "done", {
    artistId,
    ms: Date.now() - t0,
    ...extra,
  });
}

export function artistPagePhaseError(
  phase: string,
  artistId: string,
  t0: number,
  err: unknown,
): void {
  console.warn(TAG, phase, "error", {
    artistId,
    ms: Date.now() - t0,
    message: err instanceof Error ? err.message : String(err),
  });
}

/** If debug is off, returns `p` unchanged (zero overhead). */
export function withArtistPagePhaseLog<T>(
  phase: string,
  artistId: string,
  p: Promise<T>,
  extraOnDone?: (value: T) => Record<string, unknown> | undefined,
): Promise<T> {
  if (!isArtistPageDebugEnabled(artistId)) return p;
  const t0 = artistPagePhaseStart(phase, artistId);
  return p.then(
    (v) => {
      const more = extraOnDone?.(v);
      artistPagePhaseEnd(phase, artistId, t0, more);
      return v;
    },
    (e) => {
      artistPagePhaseError(phase, artistId, t0, e);
      throw e;
    },
  );
}
