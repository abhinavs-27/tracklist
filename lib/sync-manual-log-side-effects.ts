import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { scheduleEnrichArtistGenresForTrackIds } from "@/lib/taste/enrich-artist-genres";

/**
 * After a manual log row is inserted:
 * 1. Enqueue catalog hydration (never block on Spotify in the request path).
 * 2. Refresh `album_stats` / `track_stats` from `logs`.
 * Profile “recent” UIs read only from `logs` + catalog tables — no spotify_recent_tracks.
 */
export async function syncManualLogSideEffects(
  _userId: string,
  trackId: string,
  _listenedAtIso: string,
): Promise<void> {
  await enqueueSpotifyEnrich({ name: "enrich_track", trackId });

  const supabase = createSupabaseAdminClient();
  scheduleEnrichArtistGenresForTrackIds(supabase, [trackId]);
  const { error: refreshError } = await supabase.rpc("refresh_entity_stats");
  if (refreshError) {
    console.warn("[syncManualLog] refresh_entity_stats failed", refreshError);
  }
}

type BatchEntry = { trackId: string; listenedAtIso: string };

/**
 * After many log rows are inserted (e.g. Last.fm import), hydrate catalog and refresh stats once.
 * When `skipSpotifyEnrich` is true (Last.fm-only backfill), skips `enrich_track` Spotify jobs only.
 */
export async function syncBatchLogSideEffects(
  _userId: string,
  entries: BatchEntry[],
  options?: { skipSpotifyEnrich?: boolean },
): Promise<void> {
  if (entries.length === 0) return;

  const uniqueIds = [...new Set(entries.map((e) => e.trackId))];

  if (!options?.skipSpotifyEnrich) {
    // Parallelize enqueuing jobs
    await Promise.all(
      uniqueIds.map((id) =>
        enqueueSpotifyEnrich({ name: "enrich_track", trackId: id }),
      ),
    );
  }

  const supabase = createSupabaseAdminClient();
  scheduleEnrichArtistGenresForTrackIds(supabase, uniqueIds);

  const { error: refreshError } = await supabase.rpc("refresh_entity_stats");
  if (refreshError) {
    console.warn("[syncBatchLog] refresh_entity_stats failed", refreshError);
  }
}
