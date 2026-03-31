import "server-only";

import {
  collectTrackIdsNeedingEnrichment,
  scheduleExploreTrackEnrichment,
} from "@/lib/explore-enrich";

export type EnrichTracksAsyncPayload = {
  /** Normalized map from `batchTracksToNormalizedMap` + DB-only `getOrFetchTracksBatch`. */
  tracksMap: Map<string, SpotifyApi.TrackObjectFull | null>;
  /** All catalog entity ids for this batch (trending + hidden-gem songs), in any order. */
  entityIds: string[];
};

/**
 * Non-blocking track hydration: finds rows missing title/artist/cover from the DB-only map,
 * then queues Spotify/catalog fetch with shared safeguards (dedupe, max batch, timeout, `after()`).
 * Does not await — safe to call from RSC after building `tracks` from `getOrFetchTracksBatch(..., { allowNetwork: false })`.
 *
 * Skips when `SPOTIFY_REFRESH_DISABLED=true` (same policy as catalog reads).
 */
export function enrichTracksAsync(tracks: EnrichTracksAsyncPayload): void {
  if (process.env.SPOTIFY_REFRESH_DISABLED === "true") return;
  const ids = collectTrackIdsNeedingEnrichment(tracks.entityIds, tracks.tracksMap);
  scheduleExploreTrackEnrichment(ids);
}
