import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getOrFetchTrack } from "@/lib/spotify-cache";

/**
 * After a manual log row is inserted, align with Spotify auto-ingest behavior:
 * 1. Ensure `songs` / `albums` / `artists` rows exist (album_stats join uses songs.album_id).
 * 2. Upsert `spotify_recent_tracks` so profile “Recently played” / “Recent albums” include manual logs.
 * 3. Refresh `album_stats` / `track_stats` from `logs` so entity listen counts stay accurate.
 */
export async function syncManualLogSideEffects(
  userId: string,
  trackId: string,
  listenedAtIso: string,
): Promise<void> {
  let track: SpotifyApi.TrackObjectFull;
  try {
    track = await getOrFetchTrack(trackId);
  } catch (e) {
    console.warn("[syncManualLog] getOrFetchTrack failed; stats may be incomplete until refresh", {
      trackId,
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  const album = track.album;
  const artists = track.artists ?? [];
  const artistName = artists.map((a) => a.name).join(", ") || "Unknown";
  const albumImage = album?.images?.[0]?.url ?? null;

  const supabase = createSupabaseAdminClient();
  const { error: recentError } = await supabase.from("spotify_recent_tracks").upsert(
    {
      user_id: userId,
      track_id: track.id,
      track_name: track.name ?? "",
      artist_name: artistName,
      album_id: album?.id ?? null,
      album_name: album?.name ?? null,
      album_image: albumImage,
      played_at: listenedAtIso,
    },
    { onConflict: "user_id,track_id,played_at" },
  );

  if (recentError) {
    console.warn("[syncManualLog] spotify_recent_tracks upsert failed", recentError);
  }

  const { error: refreshError } = await supabase.rpc("refresh_entity_stats");
  if (refreshError) {
    console.warn("[syncManualLog] refresh_entity_stats failed", refreshError);
  }
}
