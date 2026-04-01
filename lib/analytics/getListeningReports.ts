import "server-only";

import {
  buildListeningReport,
  type AggregateReportRow,
} from "@/lib/analytics/build-listening-report";
import type {
  ListeningReportItem,
  ListeningReportSnapshotV1,
  ListeningReportsResult,
  ReportEntityType,
  ReportRange,
} from "@/lib/analytics/listening-report-types";
import {
  inclusiveRangeToListenWindow,
  listeningReportInclusiveBoundsForPreset,
  previousListeningReportInclusiveRange,
  type InclusiveDateRange,
} from "@/lib/analytics/listening-report-windows";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { LIMITS } from "@/lib/validation";

export type {
  ListeningReportItem,
  ListeningReportSnapshotV1,
  ListeningReportsResult,
  ReportEntityType,
  ReportRange,
} from "@/lib/analytics/listening-report-types";

/** @see `lib/analytics/build-listening-report.ts` — single source for report aggregates from `logs`. */
export { buildListeningReport } from "@/lib/analytics/build-listening-report";
export type {
  ListeningReportBuildResult,
} from "@/lib/analytics/build-listening-report";

function clampLimit(n: number): number {
  return Math.min(100, Math.max(1, Math.floor(n)));
}

const MAX_RANK_ROWS = 5000;

function buildRankMap(rows: { entity_id: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => m.set(r.entity_id, i + 1));
  return m;
}

function isSyntheticReportEntityId(id: string): boolean {
  return id.startsWith("__tl_");
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
  /** DB/cache only on the request path — Spotify hydration runs separately (e.g. POST /api/reports/warm-catalog). */
  const catalogOpts = { allowNetwork: false as const };

  if (entityType === "artist") {
    const fetchIds = ids.filter((id) => !isSyntheticReportEntityId(id));
    const list = fetchIds.length
      ? await getOrFetchArtistsBatch(fetchIds, catalogOpts)
      : [];
    const byEntityId = new Map(
      fetchIds.map((id, i) => [id, list[i] ?? null] as const),
    );
    return rows.map((r, i) => {
      const rank = rankOffset + i + 1;
      if (isSyntheticReportEntityId(r.entity_id)) {
        const pr = prevRankMap.get(r.entity_id) ?? null;
        const isNew = !prevRankMap.has(r.entity_id);
        return {
          entityId: r.entity_id,
          name: "Unknown artist",
          image: null,
          count: r.count,
          rank,
          previousRank: pr,
          movement: pr != null ? pr - rank : null,
          isNew,
        };
      }
      const a = byEntityId.get(r.entity_id) ?? null;
      const pr = prevRankMap.get(r.entity_id) ?? null;
      const isNew = !prevRankMap.has(r.entity_id);
      return {
        entityId: r.entity_id,
        name: a?.name ?? r.entity_id,
        image:
          a?.images?.[0]?.url ?? r.cover_image_url?.trim() ?? null,
        count: r.count,
        rank,
        previousRank: pr,
        movement: pr != null ? pr - rank : null,
        isNew,
      };
    });
  }
  if (entityType === "album") {
    const fetchIds = ids.filter((id) => !isSyntheticReportEntityId(id));
    const list = fetchIds.length
      ? await getOrFetchAlbumsBatch(fetchIds, catalogOpts)
      : [];
    const byEntityId = new Map(
      fetchIds.map((id, i) => [id, list[i] ?? null] as const),
    );
    return rows.map((r, i) => {
      const rank = rankOffset + i + 1;
      if (isSyntheticReportEntityId(r.entity_id)) {
        const pr = prevRankMap.get(r.entity_id) ?? null;
        const isNew = !prevRankMap.has(r.entity_id);
        return {
          entityId: r.entity_id,
          name: "Unknown album",
          image: null,
          count: r.count,
          rank,
          previousRank: pr,
          movement: pr != null ? pr - rank : null,
          isNew,
        };
      }
      const a = byEntityId.get(r.entity_id) ?? null;
      const pr = prevRankMap.get(r.entity_id) ?? null;
      const isNew = !prevRankMap.has(r.entity_id);
      return {
        entityId: r.entity_id,
        name: a?.name ?? r.entity_id,
        image:
          a?.images?.[0]?.url ?? r.cover_image_url?.trim() ?? null,
        count: r.count,
        rank,
        previousRank: pr,
        movement: pr != null ? pr - rank : null,
        isNew,
      };
    });
  }
  const fetchIds = ids.filter((id) => !isSyntheticReportEntityId(id));
  const list = fetchIds.length
    ? await getOrFetchTracksBatch(fetchIds, catalogOpts)
    : [];
  const byEntityId = new Map(
    fetchIds.map((id, i) => [id, list[i] ?? null] as const),
  );
  return rows.map((r, i) => {
    const rank = rankOffset + i + 1;
    if (isSyntheticReportEntityId(r.entity_id)) {
      const pr = prevRankMap.get(r.entity_id) ?? null;
      const isNew = !prevRankMap.has(r.entity_id);
      return {
        entityId: r.entity_id,
        name: "Unknown track",
        image: null,
        count: r.count,
        rank,
        previousRank: pr,
        movement: pr != null ? pr - rank : null,
        isNew,
      };
    }
    const t = byEntityId.get(r.entity_id) ?? null;
    const pr = prevRankMap.get(r.entity_id) ?? null;
    const isNew = !prevRankMap.has(r.entity_id);
    return {
      entityId: r.entity_id,
      name: t?.name ?? r.entity_id,
      image:
        t?.album?.images?.[0]?.url ?? r.cover_image_url?.trim() ?? null,
      count: r.count,
      rank,
      previousRank: pr,
      movement: pr != null ? pr - rank : null,
      isNew,
    };
  });
}

function presetPeriodLabel(
  range: Exclude<ReportRange, "custom">,
  bounds: InclusiveDateRange,
): string {
  if (range === "week") {
    return `Week of ${bounds.start}`;
  }
  if (range === "month") {
    return bounds.start.slice(0, 7);
  }
  return bounds.start.slice(0, 4);
}

/**
 * Full enriched snapshot for all entity kinds (for `saved_reports.snapshot_json`).
 * Uses the same builder + enrichment as live reports.
 */
export async function buildListeningReportSnapshotForSave(args: {
  userId: string;
  range: ReportRange;
  startDate: string;
  endDate: string;
}): Promise<ListeningReportSnapshotV1> {
  const currentBounds: InclusiveDateRange = {
    start: args.startDate,
    end: args.endDate,
  };
  const prevBounds = previousListeningReportInclusiveRange({
    range: args.range,
    current: currentBounds,
    customStart: args.range === "custom" ? args.startDate : undefined,
    customEnd: args.range === "custom" ? args.endDate : undefined,
  });

  const [builtCurrent, builtPrev] = await Promise.all([
    buildListeningReport({
      userId: args.userId,
      startDate: currentBounds.start,
      endDate: currentBounds.end,
    }),
    buildListeningReport({
      userId: args.userId,
      startDate: prevBounds.start,
      endDate: prevBounds.end,
    }),
  ]);

  const periodLabel =
    args.range === "custom"
      ? `${args.startDate} → ${args.endDate}`
      : presetPeriodLabel(args.range, currentBounds);

  const kinds: ReportEntityType[] = ["artist", "album", "track", "genre"];
  const itemsByType = {} as Record<ReportEntityType, ListeningReportItem[]>;
  for (const k of kinds) {
    const prevRankMap = buildRankMap(builtPrev.byEntity[k]);
    const rows = builtCurrent.byEntity[k].slice(0, MAX_RANK_ROWS);
    itemsByType[k] = await enrichReportItems(k, rows, 0, prevRankMap);
  }

  return {
    v: 1,
    periodLabel,
    totals: { totalPlays: builtCurrent.totalPlays },
    itemsByType,
  };
}

export function listeningReportsResultFromSnapshot(args: {
  snapshot: ListeningReportSnapshotV1;
  entityType: ReportEntityType;
  range: ReportRange;
  limit: number;
  offset: number;
}): ListeningReportsResult {
  const { snapshot, entityType, range, limit, offset } = args;
  const all = snapshot.itemsByType[entityType] ?? [];
  const page = all.slice(offset, offset + limit);
  const hasMore = all.length > offset + limit;
  return {
    items: page,
    range,
    periodLabel: snapshot.periodLabel,
    nextOffset: hasMore ? offset + limit : null,
  };
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

  let currentBounds: InclusiveDateRange;
  let periodLabel: string;

  if (args.range === "custom") {
    if (!args.startDate || !args.endDate) return null;
    const start = new Date(`${args.startDate}T00:00:00.000Z`);
    const endExclusive = new Date(`${args.endDate}T00:00:00.000Z`);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
      return null;
    }
    if (endExclusive <= start) return null;
    try {
      inclusiveRangeToListenWindow({
        startDate: args.startDate,
        endDate: args.endDate,
      });
    } catch {
      return null;
    }
    const days =
      (endExclusive.getTime() - start.getTime()) / (86400 * 1000);
    if (days > LIMITS.REPORTS_CUSTOM_MAX_DAYS) return null;

    currentBounds = { start: args.startDate, end: args.endDate };
    periodLabel = `${args.startDate} → ${args.endDate}`;
  } else {
    currentBounds = listeningReportInclusiveBoundsForPreset(args.range);
    periodLabel = presetPeriodLabel(args.range, currentBounds);
  }

  const prevBounds = previousListeningReportInclusiveRange({
    range: args.range,
    current: currentBounds,
    customStart: args.range === "custom" ? args.startDate ?? undefined : undefined,
    customEnd: args.range === "custom" ? args.endDate ?? undefined : undefined,
  });

  const [builtCurrent, builtPrev] = await Promise.all([
    buildListeningReport({
      userId: args.userId,
      startDate: currentBounds.start,
      endDate: currentBounds.end,
    }),
    buildListeningReport({
      userId: args.userId,
      startDate: prevBounds.start,
      endDate: prevBounds.end,
    }),
  ]);

  console.info("[listening-report] getListeningReports", {
    userId: args.userId,
    entityType: args.entityType,
    range: args.range,
    currentBounds,
    prevBounds,
    playsCurrent: builtCurrent.totalPlays,
    playsPrevious: builtPrev.totalPlays,
  });

  const rawCurrent = builtCurrent.byEntity[args.entityType];
  const rawPrev = builtPrev.byEntity[args.entityType];
  const prevRankMap = buildRankMap(rawPrev);
  const hasMore = rawCurrent.length > offset + limit;
  const pageSlice = rawCurrent.slice(offset, offset + limit);
  const items = await enrichReportItems(
    args.entityType,
    pageSlice,
    offset,
    prevRankMap,
  );

  return {
    items,
    range: args.range,
    periodLabel,
    nextOffset: hasMore ? offset + limit : null,
  };
}
