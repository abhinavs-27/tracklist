import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getTrackIdByExternalId } from "@/lib/catalog/entity-resolution";

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

  const spotifyTrackIds = [...new Set(entries.map((e) => e.spotifyTrackId))];
  const spotifyToCanonical = new Map<string, string>();
  for (const sid of spotifyTrackIds) {
    const u = await getTrackIdByExternalId(supabase, "spotify", sid);
    if (u) spotifyToCanonical.set(sid, u);
  }

  const times = entries.map((e) => new Date(e.listenedAt).getTime()).filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];

  const minT = Math.min(...times) - windowMs;
  const maxT = Math.max(...times) + windowMs;

  const canonicalIds = [...new Set(spotifyToCanonical.values())];
  if (canonicalIds.length === 0) return entries;

  const { data, error } = await supabase
    .from("logs")
    .select("track_id, listened_at")
    .eq("user_id", userId)
    .in("track_id", canonicalIds)
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
    const canon = spotifyToCanonical.get(e.spotifyTrackId);
    if (!canon) return true;
    const conflict = existing.some((row) => {
      if (row.track_id !== canon) return false;
      const rt = new Date(row.listened_at).getTime();
      return Math.abs(rt - t) < windowMs;
    });
    return !conflict;
  });
}
