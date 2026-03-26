import "server-only";

import { unstable_cache } from "next/cache";

import type { ReportEntityType } from "@/lib/analytics/getListeningReports";
import {
  currentMonthStart,
  currentWeekStart,
  currentYear,
  previousCalendarYear,
  previousMonthStart,
  previousWeekStart,
} from "@/lib/analytics/period-now";
import { getAlbum, getArtist, getTrack } from "@/lib/spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ReportCompareRange = "week" | "month" | "year";

export type ListeningReportsCompareResult = {
  totalPlaysCurrent: number;
  totalPlaysPrevious: number;
  percentChange: number | null;
  topGainer: { entityId: string; name: string } | null;
  topDropper: { entityId: string; name: string } | null;
};

type AggRow = { entity_id: string; count: number };

const MAX_ROWS = 5000;

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
    console.warn("[getReportsCompare] countLogs", error.message);
    return 0;
  }
  return count ?? 0;
}

function bucketToLogRange(args: {
  weekStart: string | null;
  monthStart: string | null;
  year: number | null;
}): { startIso: string; endExclusiveIso: string } | null {
  if (args.weekStart) {
    const start = new Date(`${args.weekStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { startIso: start.toISOString(), endExclusiveIso: end.toISOString() };
  }
  if (args.monthStart) {
    const [y, mo] = args.monthStart.split("-").map(Number);
    const start = new Date(Date.UTC(y, mo - 1, 1));
    const end = new Date(Date.UTC(y, mo, 1));
    return { startIso: start.toISOString(), endExclusiveIso: end.toISOString() };
  }
  if (args.year != null) {
    const start = new Date(Date.UTC(args.year, 0, 1));
    const end = new Date(Date.UTC(args.year + 1, 0, 1));
    return { startIso: start.toISOString(), endExclusiveIso: end.toISOString() };
  }
  return null;
}

async function fetchAllEntityRows(args: {
  userId: string;
  entityType: ReportEntityType;
  weekStart: string | null;
  monthStart: string | null;
  year: number | null;
}): Promise<AggRow[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("user_listening_aggregates")
    .select("entity_id, count")
    .eq("user_id", args.userId)
    .eq("entity_type", args.entityType)
    .order("count", { ascending: false })
    .limit(MAX_ROWS);

  if (args.weekStart) {
    q = q.eq("week_start", args.weekStart).is("month", null).is("year", null);
  } else if (args.monthStart) {
    q = q.eq("month", args.monthStart).is("week_start", null).is("year", null);
  } else if (args.year != null) {
    q = q.eq("year", args.year).is("week_start", null).is("month", null);
  } else {
    return [];
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[getReportsCompare] aggregates", error.message);
    return [];
  }
  return (data ?? []) as AggRow[];
}

/** DB + catalog (no cookie client) — safe inside cached compare + API routes. */
async function resolveArtistName(artistId: string): Promise<string> {
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
  entityType: ReportEntityType,
  entityId: string,
): Promise<string> {
  if (entityType === "genre") {
    return entityId.trim() || entityId;
  }
  const admin = createSupabaseAdminClient();
  if (entityType === "artist") {
    return resolveArtistName(entityId);
  }
  if (entityType === "album") {
    const { data: row } = await admin
      .from("albums")
      .select("name")
      .eq("id", entityId)
      .maybeSingle();
    const fromDb = (row as { name?: string } | null)?.name?.trim();
    if (fromDb) return fromDb;
    try {
      const a = await getAlbum(entityId);
      return a.name?.trim() || entityId;
    } catch {
      return entityId;
    }
  }
  const { data: row } = await admin
    .from("songs")
    .select("name")
    .eq("id", entityId)
    .maybeSingle();
  const fromDb = (row as { name?: string } | null)?.name?.trim();
  if (fromDb) return fromDb;
  try {
    const t = await getTrack(entityId);
    return t.name?.trim() || entityId;
  } catch {
    return entityId;
  }
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

async function fetchListeningReportsCompareUncached(args: {
  userId: string;
  range: ReportCompareRange;
  entityType: ReportEntityType;
}): Promise<ListeningReportsCompareResult> {
  let weekStart: string | null = null;
  let monthStart: string | null = null;
  let year: number | null = null;

  if (args.range === "week") {
    weekStart = currentWeekStart();
  } else if (args.range === "month") {
    monthStart = currentMonthStart();
  } else {
    year = currentYear();
  }

  let pWeek: string | null = null;
  let pMonth: string | null = null;
  let pYear: number | null = null;
  if (weekStart) pWeek = previousWeekStart(weekStart);
  else if (monthStart) pMonth = previousMonthStart(monthStart);
  else if (year != null) pYear = previousCalendarYear(year);

  const curRange = bucketToLogRange({ weekStart, monthStart, year });
  const prevRange = bucketToLogRange({
    weekStart: pWeek,
    monthStart: pMonth,
    year: pYear,
  });

  const [
    totalPlaysCurrent,
    totalPlaysPrevious,
    curEntities,
    prevEntities,
  ] = await Promise.all([
    curRange
      ? countLogsInRange({
          userId: args.userId,
          startIso: curRange.startIso,
          endExclusiveIso: curRange.endExclusiveIso,
        })
      : 0,
    prevRange
      ? countLogsInRange({
          userId: args.userId,
          startIso: prevRange.startIso,
          endExclusiveIso: prevRange.endExclusiveIso,
        })
      : 0,
    fetchAllEntityRows({
      userId: args.userId,
      entityType: args.entityType,
      weekStart,
      monthStart,
      year,
    }),
    fetchAllEntityRows({
      userId: args.userId,
      entityType: args.entityType,
      weekStart: pWeek,
      monthStart: pMonth,
      year: pYear,
    }),
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

const cachedCompare = unstable_cache(
  async (
    userId: string,
    range: ReportCompareRange,
    entityType: ReportEntityType,
  ) =>
    fetchListeningReportsCompareUncached({ userId, range, entityType }),
  ["listening-reports-compare"],
  { revalidate: 120 },
);

export async function getListeningReportsCompare(args: {
  userId: string;
  range: ReportCompareRange;
  entityType: ReportEntityType;
}): Promise<ListeningReportsCompareResult> {
  return cachedCompare(args.userId, args.range, args.entityType);
}
