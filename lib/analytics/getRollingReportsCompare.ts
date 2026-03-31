import "server-only";

import { getRolling7dVsPrior7dBounds } from "@/lib/analytics/rolling-windows";
import { getArtist } from "@/lib/spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import type { ListeningReportsCompareResult } from "@/lib/analytics/getReportsCompare";

export type { ListeningReportsCompareResult };

type AggRow = { entity_id: string; count: number };

const MAX_ROWS = 20000;
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

async function fetchSongsBatch(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, { album_id: string; artist_id: string }>> {
  const out = new Map<string, { album_id: string; artist_id: string }>();
  const unique = [...new Set(ids)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("tracks")
      .select("id, album_id, artist_id")
      .in("id", chunk);
    if (error) {
      console.warn("[rolling-compare] songs batch", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; album_id: string; artist_id: string };
      out.set(r.id, { album_id: r.album_id, artist_id: r.artist_id });
    }
  }
  return out;
}

async function fetchArtistsBatchGenres(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, { genres: string[] | null }>> {
  const out = new Map<string, { genres: string[] | null }>();
  const unique = [...new Set(ids)].filter(Boolean);
  const CHUNK = 300;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("artists")
      .select("id, genres")
      .in("id", chunk);
    if (error) {
      console.warn("[rolling-compare] artists batch", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; genres: string[] | null };
      out.set(r.id, { genres: r.genres });
    }
  }
  return out;
}

export async function fetchArtistAggFromLogs(
  userId: string,
  startIso: string,
  endExclusiveIso: string,
): Promise<AggRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("logs")
    .select("track_id, artist_id")
    .eq("user_id", userId)
    .gte("listened_at", startIso)
    .lt("listened_at", endExclusiveIso)
    .limit(MAX_ROWS);

  if (error) {
    console.warn("[rolling-compare] artist logs", error.message);
    return [];
  }

  const rows = (data ?? []) as { track_id: string; artist_id: string | null }[];
  const trackIds = [...new Set(rows.map((r) => r.track_id).filter(Boolean))];
  const songMap = trackIds.length ? await fetchSongsBatch(admin, trackIds) : new Map();

  const counts = new Map<string, number>();
  for (const r of rows) {
    let aid = r.artist_id?.trim() ?? null;
    if (!aid && r.track_id) {
      aid = songMap.get(r.track_id)?.artist_id?.trim() ?? null;
    }
    if (!aid) continue;
    counts.set(aid, (counts.get(aid) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RANK)
    .map(([entity_id, count]) => ({ entity_id, count }));
}

async function fetchGenreAggFromLogs(
  userId: string,
  startIso: string,
  endExclusiveIso: string,
): Promise<AggRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("logs")
    .select("track_id, artist_id")
    .eq("user_id", userId)
    .gte("listened_at", startIso)
    .lt("listened_at", endExclusiveIso)
    .limit(MAX_ROWS);

  if (error) {
    console.warn("[rolling-compare] genre logs", error.message);
    return [];
  }

  const rows = (data ?? []) as { track_id: string; artist_id: string | null }[];
  const trackIds = [...new Set(rows.map((r) => r.track_id).filter(Boolean))];
  const songMap = trackIds.length ? await fetchSongsBatch(admin, trackIds) : new Map();

  const artistCounts = new Map<string, number>();
  for (const r of rows) {
    let aid = r.artist_id?.trim() ?? null;
    if (!aid && r.track_id) {
      aid = songMap.get(r.track_id)?.artist_id?.trim() ?? null;
    }
    if (!aid) continue;
    artistCounts.set(aid, (artistCounts.get(aid) ?? 0) + 1);
  }

  if (artistCounts.size === 0) return [];

  const meta = await fetchArtistsBatchGenres(admin, [...artistCounts.keys()]);
  const genreRaw = new Map<string, number>();
  for (const [artistId, listenCount] of artistCounts) {
    const genres =
      meta.get(artistId)?.genres?.map((g) => g.trim()).filter(Boolean) ?? [];
    if (genres.length === 0) continue;
    const per = listenCount / genres.length;
    for (const g of genres) {
      const key = g.toLowerCase();
      genreRaw.set(key, (genreRaw.get(key) ?? 0) + per);
    }
  }

  return [...genreRaw.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RANK)
    .map(([entity_id, count]) => ({
      entity_id,
      count: Math.round(count * 100) / 100,
    }));
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
  const { current, previous } = getRolling7dVsPrior7dBounds();

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
    fetchAgg(
      args.userId,
      current.startIso,
      current.endExclusiveIso,
    ),
    fetchAgg(
      args.userId,
      previous.startIso,
      previous.endExclusiveIso,
    ),
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

/** Top artist IDs by play count in a log window (for “new in rotation” discovery). */
export async function getTopArtistIdsForLogWindow(
  userId: string,
  startIso: string,
  endExclusiveIso: string,
  limit: number,
): Promise<string[]> {
  const rows = await fetchArtistAggFromLogs(userId, startIso, endExclusiveIso);
  return rows.slice(0, limit).map((r) => r.entity_id);
}
