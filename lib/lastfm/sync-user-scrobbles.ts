import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import { ingestLastfmScrobbles } from "@/lib/lastfm/ingest";

export const LASTFM_USER_SYNC_FETCH_LIMIT = 100;

async function getMaxLastfmListenAt(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("logs")
    .select("listened_at")
    .eq("user_id", userId)
    .eq("source", "lastfm")
    .order("listened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[lastfm sync] max listened_at query failed", userId, error);
    return null;
  }
  return data?.listened_at ?? null;
}

export type SyncLastfmUserResult = {
  imported: number;
  /** ISO time written to `users.lastfm_last_synced_at`, or null if fetch failed (no row update). */
  lastSyncedAt: string | null;
  fetchFailed: boolean;
  fetchError?: string;
  fetchErrorCode?: string;
};

/**
 * Fetch Last.fm recent tracks, import new scrobbles since the latest
 * `logs` row with source lastfm (Last.fm–primary path: DB first, Spotify enriches async),
 * update `users.lastfm_last_synced_at`.
 * Used by the daily cron and by POST /api/lastfm/sync after the user saves a username.
 */
export async function syncLastfmScrobblesForUser(
  supabase: SupabaseClient,
  userId: string,
  lastfmUsername: string,
): Promise<SyncLastfmUserResult> {
  const username = lastfmUsername.trim();
  const nowIso = new Date().toISOString();

  if (!username) {
    throw new Error("syncLastfmScrobblesForUser: empty username");
  }

  try {
    const fetchResult = await fetchLastfmRecentTracksSafe(
      username,
      LASTFM_USER_SYNC_FETCH_LIMIT,
    );

    if (!fetchResult.ok) {
      return {
        imported: 0,
        lastSyncedAt: null,
        fetchFailed: true,
        fetchError: fetchResult.error,
        fetchErrorCode: fetchResult.errorCode,
      };
    }

    const maxAt = await getMaxLastfmListenAt(supabase, userId);
    const watermarkMs = maxAt ? new Date(maxAt).getTime() : 0;
    const fresh = fetchResult.tracks.filter(
      (t) => new Date(t.listenedAtIso).getTime() > watermarkMs,
    );

    /**
     * We still bump `lastfm_last_synced_at` when nothing is “fresh” vs our latest
     * `logs` row with `source = lastfm` — so the timestamp can move forward with
     * `imported: 0` (e.g. recent Last.fm plays already deduped, or watermark edge cases).
     * Full history gaps need `/api/cron/lastfm-backfill-since` with `from`, not only this incremental sync.
     */
    if (fresh.length === 0) {
      await supabase
        .from("users")
        .update({ lastfm_last_synced_at: nowIso })
        .eq("id", userId);
      return { imported: 0, lastSyncedAt: nowIso, fetchFailed: false };
    }

    const ingest = await ingestLastfmScrobbles(supabase, userId, fresh);

    await supabase
      .from("users")
      .update({ lastfm_last_synced_at: nowIso })
      .eq("id", userId);

    return {
      imported: ingest.insertedLogs,
      lastSyncedAt: nowIso,
      fetchFailed: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[lastfm sync] skipped user (sync error)", { userId, username, error: msg });
    return {
      imported: 0,
      lastSyncedAt: null,
      fetchFailed: true,
      fetchError: msg,
      fetchErrorCode: "sync_exception",
    };
  }
}
