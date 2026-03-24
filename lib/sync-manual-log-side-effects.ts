import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getOrFetchTrack } from "@/lib/spotify-cache";

/**
 * After a manual log row is inserted:
 * 1. Ensure `songs` / `albums` / `artists` rows exist via getOrFetchTrack (catalog cache).
 * 2. Refresh `album_stats` / `track_stats` from `logs`.
 * Profile “recent” UIs read only from `logs` + catalog tables — no spotify_recent_tracks.
 */
export async function syncManualLogSideEffects(
  _userId: string,
  trackId: string,
  _listenedAtIso: string,
): Promise<void> {
  try {
    await getOrFetchTrack(trackId);
  } catch (e) {
    console.warn("[syncManualLog] getOrFetchTrack failed; stats may be incomplete until refresh", {
      trackId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const supabase = createSupabaseAdminClient();
  const { error: refreshError } = await supabase.rpc("refresh_entity_stats");
  if (refreshError) {
    console.warn("[syncManualLog] refresh_entity_stats failed", refreshError);
  }
}

type BatchEntry = { trackId: string; listenedAtIso: string };

/**
 * After many log rows are inserted (e.g. Last.fm import), hydrate catalog and refresh stats once.
 */
export async function syncBatchLogSideEffects(
  _userId: string,
  entries: BatchEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const uniqueIds = [...new Set(entries.map((e) => e.trackId))];

  for (const id of uniqueIds) {
    try {
      await getOrFetchTrack(id);
    } catch (e) {
      console.warn("[syncBatchLog] getOrFetchTrack failed", { id, error: e });
    }
  }

  const supabase = createSupabaseAdminClient();
  const { error: refreshError } = await supabase.rpc("refresh_entity_stats");
  if (refreshError) {
    console.warn("[syncBatchLog] refresh_entity_stats failed", refreshError);
  }
}
