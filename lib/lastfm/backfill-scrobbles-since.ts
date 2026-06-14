import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLastfmRecentTracksPageSafe } from "@/lib/lastfm/fetch-recent";
import { createIngestEntityCache, ingestLastfmScrobbles } from "@/lib/lastfm/ingest";
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
  /** Called every PAGE_LOG_INTERVAL pages with current progress. */
  onProgress?: (state: {
    pagesDone: number;
    pagesTotal: number | null;
    logsAdded: number;
  }) => Promise<void>;
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
  const entityCache = createIngestEntityCache();

  // Ingest options shared across all page calls
  const ingestOpts = {
    enqueueSpotifyResolve: false,
    skipEntityStatsRefresh: true,
    skipEntityUpdates: true,
    skipDedup: true,
    entityCache,
  } as const;

  // ── Page 1: fetch first to discover totalPages ────────────────────────────
  const firstResult = await fetchLastfmRecentTracksPageSafe(
    username, opts.limit, 1, { fromUnix, pageDelayMs: 0 },
  );
  if (!firstResult.ok) {
    return { pagesFetched, imported, fetchFailed: true, fetchError: firstResult.error, fetchErrorCode: firstResult.errorCode, hasMore: false };
  }
  pagesFetched++;
  const { totalPages } = firstResult.pageInfo;

  if (firstResult.tracks.length > 0) {
    const ingest0 = await ingestLastfmScrobbles(supabase, userId, firstResult.tracks, ingestOpts);
    imported += ingest0.insertedLogs;
    console.log(LOG_PREFIX, "Last.fm page", { username, page: 1, totalPages, tracksThisPage: firstResult.tracks.length, insertedLogsThisBatch: ingest0.insertedLogs, importedTotal: imported });
  }
  if (opts.onProgress) {
    await opts.onProgress({ pagesDone: pagesFetched, pagesTotal: totalPages > 1 ? totalPages : null, logsAdded: imported }).catch(() => {});
  }
  if (totalPages <= 1) {
    hasMore = false;
  } else {

    // ── Pages 2..N: concurrent batches of CONCURRENCY ────────────────────────
    const CONCURRENCY = 3;
    const stagger = Math.max(0, Math.floor(opts.pageDelayMs / CONCURRENCY));
    const lastPage = Math.min(totalPages, safetyCap);

    for (let batchStart = 2; batchStart <= lastPage; batchStart += CONCURRENCY) {
      const batchNums: number[] = [];
      for (let i = 0; i < CONCURRENCY && batchStart + i <= lastPage; i++) {
        batchNums.push(batchStart + i);
      }

      const batchResults = await Promise.allSettled(
        batchNums.map((pageNum, i) =>
          new Promise<void>((res) => setTimeout(res, i * stagger))
            .then(() => fetchLastfmRecentTracksPageSafe(username, opts.limit, pageNum, { fromUnix, pageDelayMs: 0 }))
            .then(async (result) => {
              if (!result.ok) throw new Error(result.error ?? "fetch failed");
              if (result.tracks.length === 0) return 0;
              const ing = await ingestLastfmScrobbles(supabase, userId, result.tracks, ingestOpts);
              return ing.insertedLogs;
            }),
        ),
      );

      let batchInserted = 0;
      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          pagesFetched++;
          batchInserted += r.value;
        } else {
          console.warn(LOG_PREFIX, "page failed (continuing)", { pages: batchNums, reason: String(r.reason) });
          hasMore = true; // failed pages must be re-run
        }
      }
      imported += batchInserted;

      console.log(LOG_PREFIX, "Last.fm batch", { username, pages: batchNums, batchInserted, importedTotal: imported });
      if (opts.onProgress) {
        await opts.onProgress({ pagesDone: pagesFetched, pagesTotal: totalPages > 1 ? totalPages : null, logsAdded: imported }).catch(() => {});
      }
    }

    hasMore = hasMore || totalPages > safetyCap;
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("users")
    .update({ lastfm_last_synced_at: nowIso })
    .eq("id", userId);

  if (imported > 0) {
    const { error: statsErr } = await supabase.rpc("refresh_entity_stats");
    if (statsErr) console.warn(LOG_PREFIX, "refresh_entity_stats failed", statsErr);
    else console.log(LOG_PREFIX, "refresh_entity_stats done");
  }

  return {
    pagesFetched,
    imported,
    fetchFailed: false,
    hasMore,
  };
}
