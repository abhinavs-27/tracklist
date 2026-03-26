import "server-only";

import { customRangeAggregate } from "@/lib/analytics/custom-range-aggregate";
import {
  currentMonthStart,
  currentWeekStart,
  currentYear,
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

async function enrichReportItems(
  entityType: ReportEntityType,
  rows: AggregateReportRow[],
): Promise<ListeningReportItem[]> {
  if (!rows.length) return [];

  if (entityType === "genre") {
    return rows.map((r) => ({
      entityId: r.entity_id,
      name: r.entity_id,
      image: r.cover_image_url ?? null,
      count: r.count,
    }));
  }

  const ids = rows.map((r) => r.entity_id);
  if (entityType === "artist") {
    const list = await getOrFetchArtistsBatch(ids);
    return rows.map((r, i) => {
      const a = list[i];
      return {
        entityId: r.entity_id,
        name: a?.name ?? r.entity_id,
        image: a?.images?.[0]?.url ?? null,
        count: r.count,
      };
    });
  }
  if (entityType === "album") {
    const list = await getOrFetchAlbumsBatch(ids);
    return rows.map((r, i) => {
      const a = list[i];
      return {
        entityId: r.entity_id,
        name: a?.name ?? r.entity_id,
        image: a?.images?.[0]?.url ?? null,
        count: r.count,
      };
    });
  }
  const list = await getOrFetchTracksBatch(ids);
  return rows.map((r, i) => {
    const t = list[i];
    return {
      entityId: r.entity_id,
      name: t?.name ?? r.entity_id,
      image: t?.album?.images?.[0]?.url ?? null,
      count: r.count,
    };
  });
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

    const raw = await customRangeAggregate({
      userId: args.userId,
      entityType: args.entityType,
      startInclusive: start,
      endExclusive,
    });
    const slice = raw.slice(offset, offset + limit);
    const hasMore = raw.length > offset + limit;
    const items = await enrichReportItems(args.entityType, slice);
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

  const rows = await fetchAggregateRows({
    userId: args.userId,
    entityType: args.entityType,
    weekStart,
    monthStart,
    year,
    limit: limit + 1,
    offset,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await enrichReportItems(args.entityType, page);
  const nextOffset = hasMore ? offset + limit : null;

  return {
    items,
    range: args.range,
    periodLabel,
    nextOffset,
  };
}
