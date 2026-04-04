import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLastfmRecentTracksPageSafe } from "@/lib/lastfm/fetch-recent";
import { ingestLastfmScrobbles } from "@/lib/lastfm/ingest";
import { LASTFM_USER_SYNC_FETCH_LIMIT } from "@/lib/lastfm/sync-user-scrobbles";

export const DEFAULT_LASTFM_BACKFILL_SINCE_ISO = "2026-03-31T00:00:00.000Z";

const USERS_PAGE = 500;
const LOG_PREFIX = "[lastfm-backfill-since]";
/** Log Last.fm page progress every N pages (reduces noise). */
const PAGE_LOG_INTERVAL = 10;

/**
 * Every user with a non-empty `lastfm_username`, oldest `lastfm_last_synced_at` first.
 */
export async function fetchAllLastfmUsers(
  supabase: SupabaseClient,
): Promise<{ id: string; lastfm_username: string }[]> {
  return fetchUsersWithLastfmUsernames(supabase, Number.POSITIVE_INFINITY);
}

/**
 * Users with Last.fm usernames, paginated. Prefer {@link fetchAllLastfmUsers} for the backfill cron.
 */
export async function fetchUsersWithLastfmUsernames(
  supabase: SupabaseClient,
  maxUsers: number,
): Promise<{ id: string; lastfm_username: string }[]> {
  const out: { id: string; lastfm_username: string }[] = [];
  const cap =
    Number.isFinite(maxUsers) && maxUsers > 0 ? maxUsers : Number.POSITIVE_INFINITY;
  let offset = 0;

  while (out.length < cap) {
    const span = Math.min(USERS_PAGE, cap - out.length);
    const { data, error } = await supabase
      .from("users")
      .select("id, lastfm_username")
      .not("lastfm_username", "is", null)
      .neq("lastfm_username", "")
      .order("lastfm_last_synced_at", { ascending: true, nullsFirst: true })
      .range(offset, offset + span - 1);

    if (error) {
      throw error;
    }

    const raw = data ?? [];
    const batch = raw.filter(
      (u): u is { id: string; lastfm_username: string } =>
        typeof u.id === "string" && Boolean(u.lastfm_username?.trim()),
    );

    for (const u of batch) {
      out.push({
        id: u.id,
        lastfm_username: u.lastfm_username!.trim(),
      });
      if (out.length >= cap) break;
    }

    offset += raw.length;
    if (raw.length === 0) break;
    if (raw.length < span) break;
  }

  return out;
}

export type BackfillLastfmSinceOptions = {
  /** Pause between Last.fm page fetches (ms). */
  pageDelayMs: number;
  /** Last.fm `limit` per page (max 200). */
  limit: number;
  /**
   * Max Last.fm pages to fetch for one user in this process (safety valve).
   * If `hasMore` is true, call again until everyone is caught up.
   */
  maxPagesPerUser: number;
};

const DEFAULT_OPTS: BackfillLastfmSinceOptions = {
  pageDelayMs: 450,
  limit: LASTFM_USER_SYNC_FETCH_LIMIT,
  maxPagesPerUser: 500,
};

export type BackfillLastfmSinceResult = {
  pagesFetched: number;
  imported: number;
  fetchFailed: boolean;
  fetchError?: string;
  fetchErrorCode?: string;
  /** More Last.fm pages remain for this user (hit `maxPagesPerUser` or API says so). */
  hasMore: boolean;
};

/**
 * Pull Last.fm history from `fromIso` forward for one user: page until caught up or `maxPagesPerUser`.
 * Does **not** enqueue Spotify jobs — run `spotify-enrichment-retry` / repair later.
 * Existing scrobbles are skipped via ingest dedupe.
 */
export async function backfillLastfmScrobblesSince(
  supabase: SupabaseClient,
  userId: string,
  lastfmUsername: string,
  fromIso: string,
  options?: Partial<BackfillLastfmSinceOptions>,
): Promise<BackfillLastfmSinceResult> {
  const username = lastfmUsername.trim();
  const opts = { ...DEFAULT_OPTS, ...options };

  if (!username) {
    throw new Error("backfillLastfmScrobblesSince: empty username");
  }

  const fromMs = Date.parse(fromIso);
  if (Number.isNaN(fromMs)) {
    throw new Error(`backfillLastfmScrobblesSince: invalid fromIso ${fromIso}`);
  }
  const fromUnix = Math.floor(fromMs / 1000);

  const safetyCap = Math.min(
    1000,
    Math.max(1, opts.maxPagesPerUser),
  );

  let pagesFetched = 0;
  let imported = 0;
  let hasMore = false;

  let p = 1;
  for (let iter = 0; iter < safetyCap; iter++) {
    const delay = p === 1 ? 0 : Math.max(0, opts.pageDelayMs);
    const fetchResult = await fetchLastfmRecentTracksPageSafe(
      username,
      opts.limit,
      p,
      { fromUnix, pageDelayMs: delay },
    );

    if (!fetchResult.ok) {
      console.warn(LOG_PREFIX, "Last.fm fetch failed", {
        username,
        error: fetchResult.error,
      });
      return {
        pagesFetched,
        imported,
        fetchFailed: true,
        fetchError: fetchResult.error,
        fetchErrorCode: fetchResult.errorCode,
        hasMore: false,
      };
    }

    pagesFetched += 1;

    if (fetchResult.tracks.length === 0) {
      hasMore = false;
      break;
    }

    const ingest = await ingestLastfmScrobbles(supabase, userId, fetchResult.tracks, {
      enqueueSpotifyResolve: false,
    });
    imported += ingest.insertedLogs;

    const { page: pi, totalPages } = fetchResult.pageInfo;

    const shouldLogPage =
      pagesFetched === 1 ||
      pagesFetched % PAGE_LOG_INTERVAL === 0 ||
      pi >= totalPages ||
      iter + 1 >= safetyCap;
    if (shouldLogPage) {
      console.log(LOG_PREFIX, "Last.fm page", {
        username,
        page: pi,
        totalPages,
        tracksThisPage: fetchResult.tracks.length,
        insertedLogsThisBatch: ingest.insertedLogs,
        importedTotal: imported,
      });
    }

    if (pi >= totalPages) {
      hasMore = false;
      break;
    }

    if (iter + 1 >= safetyCap) {
      hasMore = true;
      break;
    }

    p += 1;
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("users")
    .update({ lastfm_last_synced_at: nowIso })
    .eq("id", userId);

  return {
    pagesFetched,
    imported,
    fetchFailed: false,
    hasMore,
  };
}
