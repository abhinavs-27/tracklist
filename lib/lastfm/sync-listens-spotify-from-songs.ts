import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lfmSongId } from "@/lib/lastfm/lfm-ids";

/**
 * Fills `listens.spotify_track_id` from `songs.spotify_id` when the song row was enriched
 * but the listen row was never updated (e.g. enrichment failed mid-job, or rate limits).
 * No Spotify API calls.
 */
export async function syncListensSpotifyTrackIdsFromSongs(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<{ scanned: number; updated: number }> {
  const limit = Math.min(2000, Math.max(50, options?.limit ?? 500));

  const { data: rows, error } = await supabase
    .from("listens")
    .select("user_id, artist_name, track_name, listened_at")
    .eq("source", "lastfm")
    .is("spotify_track_id", null)
    .order("listened_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[sync-listens-spotify] query failed", error);
    return { scanned: 0, updated: 0 };
  }

  const list = rows ?? [];
  if (list.length === 0) {
    return { scanned: 0, updated: 0 };
  }

  const songIds = [
    ...new Set(
      list.map((r) =>
        lfmSongId(
          (r as { artist_name: string }).artist_name,
          (r as { track_name: string }).track_name,
        ),
      ),
    ),
  ];

  const { data: songs, error: songErr } = await supabase
    .from("songs")
    .select("id, spotify_id")
    .in("id", songIds)
    .not("spotify_id", "is", null);

  if (songErr) {
    console.warn("[sync-listens-spotify] songs query failed", songErr);
    return { scanned: list.length, updated: 0 };
  }

  const spotifyBySongId = new Map(
    (songs ?? []).map((s) => [s.id as string, s.spotify_id as string]),
  );

  let updated = 0;
  for (const r of list) {
    const row = r as {
      user_id: string;
      artist_name: string;
      track_name: string;
      listened_at: string;
    };
    const sid = lfmSongId(row.artist_name, row.track_name);
    const spotifyTrackId = spotifyBySongId.get(sid);
    if (!spotifyTrackId) continue;

    const { error: upErr } = await supabase
      .from("listens")
      .update({ spotify_track_id: spotifyTrackId })
      .eq("user_id", row.user_id)
      .eq("artist_name", row.artist_name)
      .eq("track_name", row.track_name)
      .eq("listened_at", row.listened_at)
      .is("spotify_track_id", null);

    if (!upErr) updated += 1;
  }

  return { scanned: list.length, updated };
}
