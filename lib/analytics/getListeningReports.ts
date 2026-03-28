import "server-only";

import { customRangeAggregate } from "@/lib/analytics/custom-range-aggregate";
import {
  currentMonthStart,
  currentWeekStart,
  currentYear,
  previousCalendarYear,
  previousMonthStart,
  previousWeekStart,
} from "@/lib/analytics/period-now";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { LIMITS } from "@/lib/validation";

export type ReportEntityType = "artist" | "album" | "track" | "genre";
export type ReportRange = "week" | "month" | "year" | "custom";

export type ListeningReportItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
  /** 1-based rank within the full sorted list for this period. */
  rank: number;
  /** 1-based rank in the previous period, if the entity appeared there. */
  previousRank: number | null;
  /** Positive = moved up in rank. `previousRank - rank`. Null if new or no prior period. */
  movement: number | null;
  /** True if the entity had no plays in the comparison period. */
  isNew: boolean;
};

export type ListeningReportsResult = {
  items: ListeningReportItem[];
  range: ReportRange;
  /** ISO bounds (inclusive start, exclusive end for custom) */
  periodLabel: string;
  nextOffset: number | null;
};

function clampLimit(n: number): number {
  return Math.min(100, Math.max(1, Math.floor(n)));
}

type AggregateReportRow = {
  entity_id: string;
  count: number;
  cover_image_url?: string | null;
};

const MAX_RANK_ROWS = 5000;

function buildRankMap(rows: { entity_id: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => m.set(r.entity_id, i + 1));
  return m;
}

async function fetchAggregateRows(args: {
  userId: string;
  entityType: ReportEntityType;
  weekStart: string | null;
  monthStart: string | null;
  year: number | null;
  limit: number;
  offset: number;
}): Promise<AggregateReportRow[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("user_listening_aggregates")
    .select("entity_id, count, cover_image_url")
    .eq("user_id", args.userId)
    .eq("entity_type", args.entityType)
    .order("count", { ascending: false });

  if (args.weekStart) {
    q = q.eq("week_start", args.weekStart).is("month", null).is("year", null);
  } else if (args.monthStart) {
    q = q.eq("month", args.monthStart).is("week_start", null).is("year", null);
  } else if (args.year != null) {
    q = q.eq("year", args.year).is("week_start", null).is("month", null);
  } else {
    return [];
  }

  const { data, error } = await q.range(
    args.offset,
    args.offset + args.limit - 1,
  );
  if (error) {
    console.warn("[analytics] fetchAggregateRows", error.message);
    return [];
  }
  return (data ?? []) as AggregateReportRow[];
}

async function fetchAllAggregateRowsForBucket(args: {
  userId: string;
  entityType: ReportEntityType;
  weekStart: string | null;
  monthStart: string | null;
  year: number | null;
}): Promise<AggregateReportRow[]> {
  const admin = createSupabaseAdminClient();
  let q = admin
    .from("user_listening_aggregates")
    .select("entity_id, count, cover_image_url")
    .eq("user_id", args.userId)
    .eq("entity_type", args.entityType)
    .order("count", { ascending: false })
    .limit(MAX_RANK_ROWS);

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
    console.warn("[analytics] fetchAllAggregateRowsForBucket", error.message);
    return [];
  }
  return (data ?? []) as AggregateReportRow[];
}

function previousCustomWindow(
  startInclusive: Date,
  endExclusive: Date,
): { startInclusive: Date; endExclusive: Date } {
  const spanMs = endExclusive.getTime() - startInclusive.getTime();
  const prevEndExclusive = new Date(startInclusive.getTime());
  const prevStartInclusive = new Date(prevEndExclusive.getTime() - spanMs);
  return { startInclusive: prevStartInclusive, endExclusive: prevEndExclusive };
}

async function enrichReportItems(
  entityType: ReportEntityType,
  rows: AggregateReportRow[],
  rankOffset: number,
  prevRankMap: Map<string, number>,
): Promise<ListeningReportItem[]> {
  if (!rows.length) return [];

  if (entityType === "genre") {
    return rows.map((r, i) => {
      const rank = rankOffset + i + 1;
      const pr = prevRankMap.get(r.entity_id) ?? null;
      const isNew = !prevRankMap.has(r.entity_id);
      return {
        entityId: r.entity_id,
        name: r.entity_id,
        image: r.cover_image_url ?? null,
        count: r.count,
        rank,
        previousRank: pr,
        movement: pr != null ? pr - rank : null,
        isNew,
      };
    });
  }

  const ids = rows.map((r) => r.entity_id);
  /** User-facing report: hydrate missing catalog rows from Spotify (not default for batch helpers). */
  const catalogOpts = { allowNetwork: true as const };

  if (entityType === "artist") {
    const list = await getOrFetchArtistsBatch(ids, catalogOpts);
    const byEntityId = new Map(
      ids.map((id, i) => [id, list[i] ?? null] as const),
    );
    return rows.map((r, i) => {
      const rank = rankOffset + i + 1;
      const a = byEntityId.get(r.entity_id) ?? list[i];
      const pr = prevRankMap.get(r.entity_id) ?? null;
      const isNew = !prevRankMap.has(r.entity_id);
      return {
        entityId: r.entity_id,
        name: a?.name ?? r.entity_id,
        image: a?.images?.[0]?.url ?? null,
        count: r.count,
        rank,
        previousRank: pr,
        movement: pr != null ? pr - rank : null,
        isNew,
      };
    });
  }
  if (entityType === "album") {
    const list = await getOrFetchAlbumsBatch(ids, catalogOpts);
    const byEntityId = new Map(
      ids.map((id, i) => [id, list[i] ?? null] as const),
    );
    return rows.map((r, i) => {
      const rank = rankOffset + i + 1;
      const a = byEntityId.get(r.entity_id) ?? list[i];
      const pr = prevRankMap.get(r.entity_id) ?? null;
      const isNew = !prevRankMap.has(r.entity_id);
      return {
        entityId: r.entity_id,
        name: a?.name ?? r.entity_id,
        image: a?.images?.[0]?.url ?? null,
        count: r.count,
        rank,
        previousRank: pr,
        movement: pr != null ? pr - rank : null,
        isNew,
      };
    });
  }
  const list = await getOrFetchTracksBatch(ids, catalogOpts);
  const byEntityId = new Map(
    ids.map((id, i) => [id, list[i] ?? null] as const),
  );
  return rows.map((r, i) => {
    const rank = rankOffset + i + 1;
    const t = byEntityId.get(r.entity_id) ?? list[i];
    const pr = prevRankMap.get(r.entity_id) ?? null;
    const isNew = !prevRankMap.has(r.entity_id);
    return {
      entityId: r.entity_id,
      name: t?.name ?? r.entity_id,
      image: t?.album?.images?.[0]?.url ?? null,
      count: r.count,
      rank,
      previousRank: pr,
      movement: pr != null ? pr - rank : null,
      isNew,
    };
  });
}

function toAggregateRowsFromCustom(
  raw: { entity_id: string; count: number }[],
): AggregateReportRow[] {
  return raw.map((r) => ({
    entity_id: r.entity_id,
    count: r.count,
    cover_image_url: null,
  }));
}

export async function getListeningReports(args: {
  userId: string;
  entityType: ReportEntityType;
  range: ReportRange;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number;
  offset?: number;
}): Promise<ListeningReportsResult | null> {
  const limit = clampLimit(args.limit ?? 50);
  const offset = Math.max(0, args.offset ?? 0);

  if (args.range === "custom") {
    if (!args.startDate || !args.endDate) return null;
    const start = new Date(`${args.startDate}T00:00:00.000Z`);
    const endExclusive = new Date(`${args.endDate}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
      return null;
    }
    if (endExclusive <= start) return null;
    const days =
      (endExclusive.getTime() - start.getTime()) / (86400 * 1000);
    if (days > LIMITS.REPORTS_CUSTOM_MAX_DAYS) return null;

    const rawCurrent = await customRangeAggregate({
      userId: args.userId,
      entityType: args.entityType,
      startInclusive: start,
      endExclusive,
    });
    const prevWin = previousCustomWindow(start, endExclusive);
    const rawPrev = await customRangeAggregate({
      userId: args.userId,
      entityType: args.entityType,
      startInclusive: prevWin.startInclusive,
      endExclusive: prevWin.endExclusive,
    });

    const prevRankMap = buildRankMap(toAggregateRowsFromCustom(rawPrev));
    const currentRows = toAggregateRowsFromCustom(rawCurrent);
    const pageRows = currentRows.slice(offset, offset + limit);
    const hasMore = currentRows.length > offset + limit;
    const items = await enrichReportItems(
      args.entityType,
      pageRows,
      offset,
      prevRankMap,
    );
    return {
      items,
      range: "custom",
      periodLabel: `${args.startDate} → ${args.endDate}`,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  let weekStart: string | null = null;
  let monthStart: string | null = null;
  let year: number | null = null;
  let periodLabel = "";

  if (args.range === "week") {
    weekStart = currentWeekStart();
    periodLabel = `Week of ${weekStart}`;
  } else if (args.range === "month") {
    monthStart = currentMonthStart();
    periodLabel = monthStart.slice(0, 7);
  } else {
    year = currentYear();
    periodLabel = String(year);
  }

  let prevWeek: string | null = null;
  let prevMonth: string | null = null;
  let prevYear: number | null = null;
  if (weekStart) {
    prevWeek = previousWeekStart(weekStart);
  } else if (monthStart) {
    prevMonth = previousMonthStart(monthStart);
  } else if (year != null) {
    prevYear = previousCalendarYear(year);
  }

  const [currentRows, prevRows] = await Promise.all([
    fetchAllAggregateRowsForBucket({
      userId: args.userId,
      entityType: args.entityType,
      weekStart,
      monthStart,
      year,
    }),
    fetchAllAggregateRowsForBucket({
      userId: args.userId,
      entityType: args.entityType,
      weekStart: prevWeek,
      monthStart: prevMonth,
      year: prevYear,
    }),
  ]);

  const prevRankMap = buildRankMap(prevRows);
  const hasMore = currentRows.length > offset + limit;
  const pageSlice = hasMore
    ? currentRows.slice(offset, offset + limit)
    : currentRows.slice(offset);

  const items = await enrichReportItems(
    args.entityType,
    pageSlice,
    offset,
    prevRankMap,
  );
  const nextOffset = hasMore ? offset + limit : null;

  return {
    items,
    range: args.range,
    periodLabel,
    nextOffset,
  };
}
