import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lfmSongId } from "@/lib/lastfm/lfm-ids";

/**
 * Fills `listens.spotify_track_id` when the canonical track has a Spotify mapping in
 * `track_external_ids` but the listen row was never updated.
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

  const lfmKeys = [
    ...new Set(
      list.map((r) =>
        lfmSongId(
          (r as { artist_name: string }).artist_name,
          (r as { track_name: string }).track_name,
        ),
      ),
    ),
  ];

  const { data: lfmMaps, error: lfmErr } = await supabase
    .from("track_external_ids")
    .select("track_id, external_id")
    .eq("source", "lastfm")
    .in("external_id", lfmKeys);

  if (lfmErr || !lfmMaps?.length) {
    if (lfmErr) {
      console.warn("[sync-listens-spotify] lfm mappings query failed", lfmErr);
    }
    return { scanned: list.length, updated: 0 };
  }

  const lfmKeyToTrackUuid = new Map(
    lfmMaps.map((m) => [
      (m as { external_id: string }).external_id,
      (m as { track_id: string }).track_id,
    ]),
  );

  const trackUuids = [...new Set(lfmMaps.map((m) => (m as { track_id: string }).track_id))];

  const { data: spotMaps, error: spotErr } = await supabase
    .from("track_external_ids")
    .select("track_id, external_id")
    .eq("source", "spotify")
    .in("track_id", trackUuids);

  if (spotErr) {
    console.warn("[sync-listens-spotify] spotify mappings query failed", spotErr);
    return { scanned: list.length, updated: 0 };
  }

  const spotifyByTrackUuid = new Map(
    (spotMaps ?? []).map((m) => [
      (m as { track_id: string }).track_id,
      (m as { external_id: string }).external_id,
    ]),
  );

  const spotifyByLfmKey = new Map<string, string>();
  for (const [lfmKey, tid] of lfmKeyToTrackUuid) {
    const sid = spotifyByTrackUuid.get(tid);
    if (sid) spotifyByLfmKey.set(lfmKey, sid);
  }

  let updated = 0;
  for (const r of list) {
    const row = r as {
      user_id: string;
      artist_name: string;
      track_name: string;
      listened_at: string;
    };
    const sid = spotifyByLfmKey.get(lfmSongId(row.artist_name, row.track_name));
    if (!sid) continue;

    const { error: upErr } = await supabase
      .from("listens")
      .update({ spotify_track_id: sid })
      .eq("user_id", row.user_id)
      .eq("artist_name", row.artist_name)
      .eq("track_name", row.track_name)
      .eq("listened_at", row.listened_at)
      .is("spotify_track_id", null);

    if (!upErr) updated += 1;
  }

  return { scanned: list.length, updated };
}
