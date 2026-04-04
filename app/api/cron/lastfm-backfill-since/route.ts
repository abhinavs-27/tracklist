import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/api-response";
import {
  backfillLastfmScrobblesSince,
  DEFAULT_LASTFM_BACKFILL_SINCE_ISO,
  fetchAllLastfmUsers,
} from "@/lib/lastfm/backfill-scrobbles-since";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOG_PREFIX = "[lastfm-backfill-since]";

/**
 * One-shot behavior: every user with a Last.fm username, for each user page Last.fm
 * `user.getRecentTracks` from `from` until that user is caught up or `maxPagesPerUser` is hit.
 * Ingest dedupes rows you already have. Does **not** call Spotify (enrichment-retry / repair later).
 *
 * Re-invoke until `usersNeedingFollowUp` is 0 (serverless timeouts may require multiple runs).
 *
 * Query: `from` (UTC ISO), `pageDelayMs`, `limit`, `maxPagesPerUser` (safety cap per user per run, default 500).
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const { searchParams } = new URL(request.url);

  const fromIso =
    searchParams.get("from")?.trim() || DEFAULT_LASTFM_BACKFILL_SINCE_ISO;

  const maxPagesPerUser = Math.min(
    1000,
    Math.max(
      1,
      parseInt(searchParams.get("maxPagesPerUser") ?? "500", 10) || 500,
    ),
  );
  const pageDelayMs = Math.min(
    2500,
    Math.max(0, parseInt(searchParams.get("pageDelayMs") ?? "450", 10) || 450),
  );
  const limit = Math.min(
    200,
    Math.max(50, parseInt(searchParams.get("limit") ?? "100", 10) || 100),
  );

  let usersList: { id: string; lastfm_username: string }[] = [];

  const startedAt = Date.now();

  try {
    usersList = await fetchAllLastfmUsers(supabase);
  } catch (e) {
    console.error(LOG_PREFIX, "users load failed", e);
    return apiError(e instanceof Error ? e.message : "users load failed", 500);
  }

  console.log(LOG_PREFIX, "run start", {
    fromIso,
    totalUsers: usersList.length,
    maxPagesPerUser,
    pageDelayMs,
    limit,
  });

  const results: Array<{
    userId: string;
    username: string;
    pagesFetched: number;
    imported: number;
    hasMore: boolean;
    fetchFailed?: boolean;
    fetchError?: string;
  }> = [];

  for (let i = 0; i < usersList.length; i++) {
    const u = usersList[i]!;
    const label = `${i + 1}/${usersList.length}`;
    console.log(LOG_PREFIX, "user start", {
      progress: label,
      username: u.lastfm_username,
      userId: u.id,
    });
    try {
      const r = await backfillLastfmScrobblesSince(
        supabase,
        u.id,
        u.lastfm_username,
        fromIso,
        {
          maxPagesPerUser,
          pageDelayMs,
          limit,
        },
      );
      results.push({
        userId: u.id,
        username: u.lastfm_username,
        pagesFetched: r.pagesFetched,
        imported: r.imported,
        hasMore: r.hasMore,
        fetchFailed: r.fetchFailed,
        fetchError: r.fetchError,
      });
      console.log(LOG_PREFIX, "user done", {
        progress: label,
        username: u.lastfm_username,
        pagesFetched: r.pagesFetched,
        imported: r.imported,
        hasMore: r.hasMore,
        fetchFailed: r.fetchFailed,
      });
    } catch (e) {
      console.warn(LOG_PREFIX, "user failed", u.id, e);
      results.push({
        userId: u.id,
        username: u.lastfm_username,
        pagesFetched: 0,
        imported: 0,
        hasMore: false,
        fetchFailed: true,
        fetchError: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const usersNeedingFollowUp = results.filter(
    (r) => r.hasMore || r.fetchFailed,
  ).length;

  const durationMs = Date.now() - startedAt;

  console.log(LOG_PREFIX, "run complete", {
    fromIso,
    durationMs,
    userCount: results.length,
    usersNeedingFollowUp,
  });

  return apiOk({
    ok: true,
    fromIso,
    maxPagesPerUser,
    pageDelayMs,
    limit,
    durationMs,
    usersProcessed: results.length,
    usersNeedingFollowUp,
    results,
  });
}
