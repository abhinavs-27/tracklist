import "server-only";

import { getRolling7dVsPrior7dBounds } from "@/lib/analytics/rolling-windows";
import { getArtist } from "@/lib/spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { currentWeekStart, previousWeekStart, getWeeklyAgg } from "@/lib/analytics/from-aggregates";
import { unstable_cache } from "next/cache";

import type { ListeningReportsCompareResult } from "@/lib/analytics/getReportsCompare";

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

function pickTopMovers(
  current: AggRow[],
  previous: AggRow[],
): { gainerId: string | null; dropperId: string | null } {
  const currRank = buildRankMap(current);
  const prevRank = buildRankMap(previous);
  let bestId: string | null = null;
  let bestDelta = -Infinity;
  let worstId: string | null = null;
  let worstDelta = Infinity;

  for (const [id, cr] of currRank) {
    const pr = prevRank.get(id);
    if (pr == null) continue;
    const delta = pr - cr;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestId = id;
    }
    if (delta < worstDelta) {
      worstDelta = delta;
      worstId = id;
    }
  }

  return {
    gainerId: bestDelta > 0 ? bestId : null,
    dropperId: worstDelta < 0 ? worstId : null,
  };
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
    fetchAgg(args.userId, current.startIso, current.endExclusiveIso, curWeek),
    fetchAgg(args.userId, previous.startIso, previous.endExclusiveIso, prevWeek),
  ]);

  const percentChange =
    totalPlaysPrevious > 0
      ? ((totalPlaysCurrent - totalPlaysPrevious) / totalPlaysPrevious) * 100
      : null;

  const { gainerId, dropperId } = pickTopMovers(curEntities, prevEntities);

  let topGainer: { entityId: string; name: string } | null = null;
  let topDropper: { entityId: string; name: string } | null = null;

  if (gainerId) {
    const name = await resolveEntityDisplayName(args.entityType, gainerId);
    topGainer = { entityId: gainerId, name };
  }
  if (dropperId) {
    const name = await resolveEntityDisplayName(args.entityType, dropperId);
    topDropper = { entityId: dropperId, name };
  }

  return {
    totalPlaysCurrent,
    totalPlaysPrevious,
    percentChange,
    topGainer,
    topDropper,
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
