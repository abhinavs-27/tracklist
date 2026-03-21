import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LastfmImportEntry } from "./types";
import { DEFAULT_SCROBBLE_DEDUP_MS } from "./dedupe";

/**
 * Drop entries that would fall within {@link windowMs} of an existing log
 * for the same user + track.
 */
export async function filterAgainstExistingLogs(
  supabase: SupabaseClient,
  userId: string,
  entries: LastfmImportEntry[],
  windowMs: number = DEFAULT_SCROBBLE_DEDUP_MS,
): Promise<LastfmImportEntry[]> {
  if (entries.length === 0) return [];

  const trackIds = [...new Set(entries.map((e) => e.spotifyTrackId))];
  const times = entries.map((e) => new Date(e.listenedAt).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];

  const minT = Math.min(...times) - windowMs;
  const maxT = Math.max(...times) + windowMs;

  const { data, error } = await supabase
    .from("logs")
    .select("track_id, listened_at")
    .eq("user_id", userId)
    .in("track_id", trackIds)
    .gte("listened_at", new Date(minT).toISOString())
    .lte("listened_at", new Date(maxT).toISOString());

  if (error) {
    console.warn("[lastfm] filterAgainstExistingLogs query failed", error);
    return entries;
  }

  const existing = (data ?? []) as { track_id: string; listened_at: string }[];

  return entries.filter((e) => {
    const t = new Date(e.listenedAt).getTime();
    if (Number.isNaN(t)) return false;
    const conflict = existing.some((row) => {
      if (row.track_id !== e.spotifyTrackId) return false;
      const rt = new Date(row.listened_at).getTime();
      return Math.abs(rt - t) < windowMs;
    });
    return !conflict;
  });
}
