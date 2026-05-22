import "server-only";

import { unstable_cache } from "next/cache";

import { buildListeningReport } from "@/lib/analytics/build-listening-report";
import type { ReportEntityType } from "@/lib/analytics/getListeningReports";
import {
  listeningReportInclusiveBoundsForPreset,
  previousListeningReportInclusiveRange,
} from "@/lib/analytics/listening-report-windows";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ReportCompareRange = "week" | "month" | "year";

export type ListeningReportsCompareResult = {
  totalPlaysCurrent: number;
  totalPlaysPrevious: number;
  percentChange: number | null;
  topGainer: { entityId: string; name: string; movement: number } | null;
  topDropper: { entityId: string; name: string; movement: number } | null;
  newEntriesCount: number;
};

type AggRow = { entity_id: string; count: number };

const MAX_ROWS = 5000;

function buildRankMap(rows: AggRow[]): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => m.set(r.entity_id, i + 1));
  return m;
}

/** DB only — no Spotify on the compare path (canonical UUIDs are not Spotify API ids). */
async function resolveArtistName(artistId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("artists")
    .select("name")
    .eq("id", artistId)
    .maybeSingle();
  const fromDb = (row as { name?: string } | null)?.name?.trim();
  return fromDb || artistId;
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
    return fromDb || entityId;
  }
  const { data: row } = await admin
    .from("tracks")
    .select("name")
    .eq("id", entityId)
    .maybeSingle();
  const fromDb = (row as { name?: string } | null)?.name?.trim();
  return fromDb || entityId;
}

export function pickTopMovers(
  current: AggRow[],
  previous: AggRow[],
): { gainerId: string | null; gainerDelta: number | null; dropperId: string | null; dropperDelta: number | null } {
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
    gainerDelta: bestDelta > 0 ? bestDelta : null,
    dropperId: worstDelta < 0 ? worstId : null,
    dropperDelta: worstDelta < 0 ? worstDelta : null,
  };
}

export function countNewEntries(current: AggRow[], previous: AggRow[]): number {
  const prevIds = new Set(previous.map((r) => r.entity_id));
  return current.filter((r) => !prevIds.has(r.entity_id)).length;
}

async function fetchListeningReportsCompareUncached(args: {
  userId: string;
  range: ReportCompareRange;
  entityType: ReportEntityType;
}): Promise<ListeningReportsCompareResult> {
  const currentBounds = listeningReportInclusiveBoundsForPreset(args.range);
  const prevBounds = previousListeningReportInclusiveRange({
    range: args.range,
    current: currentBounds,
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

  const curEntities = builtCurrent.byEntity[args.entityType]
    .slice(0, MAX_ROWS)
    .map((r) => ({ entity_id: r.entity_id, count: r.count }));
  const prevEntities = builtPrev.byEntity[args.entityType]
    .slice(0, MAX_ROWS)
    .map((r) => ({ entity_id: r.entity_id, count: r.count }));

  const totalPlaysCurrent = builtCurrent.totalPlays;
  const totalPlaysPrevious = builtPrev.totalPlays;

  const percentChange =
    totalPlaysPrevious > 0
      ? ((totalPlaysCurrent - totalPlaysPrevious) / totalPlaysPrevious) * 100
      : null;

  const { gainerId, gainerDelta, dropperId, dropperDelta } = pickTopMovers(curEntities, prevEntities);
  const newEntriesCount = countNewEntries(curEntities, prevEntities);

  // Resolve names in parallel instead of sequentially
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

  console.info("[listening-report] compare", {
    userId: args.userId,
    range: args.range,
    entityType: args.entityType,
    currentBounds,
    prevBounds,
    totalPlaysCurrent,
    totalPlaysPrevious,
    newEntriesCount,
  });

  return {
    totalPlaysCurrent,
    totalPlaysPrevious,
    percentChange,
    topGainer,
    topDropper,
    newEntriesCount,
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
