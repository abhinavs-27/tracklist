import "server-only";

/** Set `TRACKLIST_DEBUG_LASTFM_SYNC=1` for per-phase timings and ingest breakdown. */
export function isDebugLastfmSync(): boolean {
  return process.env.TRACKLIST_DEBUG_LASTFM_SYNC === "1";
}
