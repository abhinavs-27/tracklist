import "server-only";

import { getRolling7dVsPrior7dBounds } from "@/lib/analytics/rolling-windows";
import { getArtist } from "@/lib/spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { currentWeekStart, previousWeekStart, getWeeklyAgg } from "@/lib/analytics/from-aggregates";
import { unstable_cache } from "next/cache";

import type { ListeningReportsCompareResult } from "@/lib/analytics/getReportsCompare";
import { pickTopMovers, countNewEntries } from "@/lib/analytics/getReportsCompare";

export type { ListeningReportsCompareResult };

type AggRow = { entity_id: string; count: number };

const MAX_RANK = 60;

function buildRankMap(rows: AggRow[]): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => m.set(r.entity_id, i + 1));
  return m;
}

async function countLogsInRange(args: {
  userId: string;
  startIso: string;
  endExclusiveIso: string;
}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("listened_at", args.startIso)
    .lt("listened_at", args.endExclusiveIso);
  if (error) {
    console.warn("[rolling-compare] countLogs", error.message);
    return 0;
  }
  return count ?? 0;
}


/**
 * Artist play-count ranking for a calendar week from precomputed aggregates.
 * Replaces `fetchArtistAggFromLogs` (was: scan 20k raw log rows + resolve tracks).
 */
export async function fetchArtistAggFromLogs(
  userId: string,
  _startIso: string,
  _endExclusiveIso: string,
  weekStart?: string,
): Promise<AggRow[]> {
  const admin = createSupabaseAdminClient();
  const wk = weekStart ?? currentWeekStart();
  const rows = await getWeeklyAgg(admin, userId, "artist", wk, MAX_RANK);
  return rows.map((r) => ({ entity_id: r.entity_id, count: r.count }));
}

/**
 * Genre play-count ranking for a calendar week from precomputed aggregates.
 * Replaces `fetchGenreAggFromLogs` (was: scan 20k rows + resolve artists → genres).
 * Genre aggregates are written by the cron alongside artist/album/track.
 */
async function fetchGenreAggFromLogs(
  userId: string,
  _startIso: string,
  _endExclusiveIso: string,
  weekStart?: string,
): Promise<AggRow[]> {
  const admin = createSupabaseAdminClient();
  const wk = weekStart ?? currentWeekStart();
  const rows = await getWeeklyAgg(admin, userId, "genre", wk, MAX_RANK);
  return rows.map((r) => ({ entity_id: r.entity_id, count: r.count }));
}


async function resolveArtistNameRolling(artistId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("artists")
    .select("name")
    .eq("id", artistId)
    .maybeSingle();
  const fromDb = (row as { name?: string } | null)?.name?.trim();
  if (fromDb) return fromDb;
  try {
    const a = await getArtist(artistId);
    return a.name?.trim() || artistId;
  } catch {
    return artistId;
  }
}

async function resolveEntityDisplayName(
  entityType: "artist" | "genre",
  entityId: string,
): Promise<string> {
  if (entityType === "genre") {
    return entityId.trim() || entityId;
  }
  if (entityType === "artist") {
    return resolveArtistNameRolling(entityId);
  }
  return entityId;
}

async function fetchListeningReportsRollingCompareUncached(args: {
  userId: string;
  entityType: "artist" | "genre";
}): Promise<ListeningReportsCompareResult> {
  // Entity rankings come from calendar-week aggregates (fast, precomputed).
  // Play-volume COUNT stays on logs — it uses a rolling window so partial-week
  // comparisons stay fair (same number of days in both windows).
  const { current, previous } = getRolling7dVsPrior7dBounds();
  const curWeek = currentWeekStart();
  const prevWeek = previousWeekStart();

  const fetchAgg =
    args.entityType === "artist"
      ? fetchArtistAggFromLogs
      : fetchGenreAggFromLogs;

  // Find the two most recent weeks with entity data for this user.  On Mondays
  // the current-week bucket is empty, and some weeks may be missing aggregates
  // entirely (tracks logged before Spotify enrichment ran).  Fetching the two
  // most recent populated weeks keeps movers stable regardless of day-of-week.
  const admin = createSupabaseAdminClient();
  const { data: weekRows } = await admin
    .from("user_listening_aggregates")
    .select("week_start")
    .eq("user_id", args.userId)
    .eq("entity_type", args.entityType)
    .not("week_start", "is", null)
    .order("week_start", { ascending: false })
    .limit(20);

  const entityWeeks = [
    ...new Set((weekRows ?? []).map((r) => r.week_start as string)),
  ].filter(Boolean).slice(0, 2);

  const effectiveCurWeek = entityWeeks[0] ?? curWeek;
  const effectivePrevWeek = entityWeeks[1] ?? prevWeek;

  const [
    totalPlaysCurrent,
    totalPlaysPrevious,
    curEntities,
    prevEntities,
  ] = await Promise.all([
    countLogsInRange({
      userId: args.userId,
      startIso: current.startIso,
      endExclusiveIso: current.endExclusiveIso,
    }),
    countLogsInRange({
      userId: args.userId,
      startIso: previous.startIso,
      endExclusiveIso: previous.endExclusiveIso,
    }),
    fetchAgg(args.userId, current.startIso, current.endExclusiveIso, effectiveCurWeek),
    fetchAgg(args.userId, previous.startIso, previous.endExclusiveIso, effectivePrevWeek),
  ]);

  const percentChange =
    totalPlaysPrevious > 0
      ? ((totalPlaysCurrent - totalPlaysPrevious) / totalPlaysPrevious) * 100
      : null;

  const { gainerId, gainerDelta, dropperId, dropperDelta } = pickTopMovers(curEntities, prevEntities);
  const newEntriesCount = countNewEntries(curEntities, prevEntities);

  const [gainerName, dropperName] = await Promise.all([
    gainerId ? resolveEntityDisplayName(args.entityType, gainerId) : Promise.resolve(null),
    dropperId ? resolveEntityDisplayName(args.entityType, dropperId) : Promise.resolve(null),
  ]);

  const topGainer =
    gainerId && gainerName && gainerDelta != null
      ? { entityId: gainerId, name: gainerName, movement: gainerDelta }
      : null;
  const topDropper =
    dropperId && dropperName && dropperDelta != null
      ? { entityId: dropperId, name: dropperName, movement: dropperDelta }
      : null;

  return {
    totalPlaysCurrent,
    totalPlaysPrevious,
    percentChange,
    topGainer,
    topDropper,
    newEntriesCount,
  };
}

const cachedRollingCompare = unstable_cache(
  async (userId: string, entityType: "artist" | "genre") =>
    fetchListeningReportsRollingCompareUncached({ userId, entityType }),
  ["listening-reports-rolling-compare"],
  { revalidate: 120 },
);

/**
 * Same shape as `getListeningReportsCompare`, but uses **rolling** 7d vs prior 7d from `logs`
 * (not UTC calendar weeks).
 */
export async function getListeningReportsRollingCompare(args: {
  userId: string;
  entityType: "artist" | "genre";
}): Promise<ListeningReportsCompareResult> {
  return cachedRollingCompare(args.userId, args.entityType);
}

/** Top artist IDs by play count in a log window (for Pulse “new discoveries”). */
export async function getTopArtistIdsForLogWindow(
  userId: string,
  startIso: string,
  endExclusiveIso: string,
  limit: number,
): Promise<string[]> {
  const rows = await fetchArtistAggFromLogs(userId, startIso, endExclusiveIso);
  return rows.slice(0, limit).map((r) => r.entity_id);
}

/**
 * Earliest listen time per artist (all-time), for a bounded candidate set.
 * Resolution matches `fetchArtistAggFromLogs` (log artist_id, else track’s artist).
 */
export async function getFirstListenAtForArtists(
  userId: string,
  artistIds: string[],
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const ids = [...new Set(artistIds.map((x) => x?.trim()).filter(Boolean))];
  if (ids.length === 0) return m;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("first_listen_at_for_artists", {
    p_user_id: userId,
    p_artist_ids: ids,
  });
  if (error) {
    console.warn("[rolling-compare] first_listen_at_for_artists", error.message);
    return m;
  }
  for (const row of data ?? []) {
    const r = row as { artist_id?: string; first_listened_at?: string };
    const aid = r.artist_id?.trim();
    const ts = r.first_listened_at;
    if (aid && ts) m.set(aid, ts);
  }
  return m;
}
