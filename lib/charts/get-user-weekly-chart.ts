import "server-only";

import { computeBiggestMovers } from "@/lib/charts/chart-movers";
import { enrichWeeklyChartApiRows } from "@/lib/charts/enrich-weekly-chart-display";
import {
  hydrateWeeklyChartDropout,
  hydrateWeeklyChartRankings,
  type HydratedWeeklyChartDropout,
} from "@/lib/charts/hydrate-weekly-chart";
import {
  isUnknownWeeklyChartEntityId,
  isUnknownWeeklyChartRow,
} from "@/lib/charts/weekly-chart-unknown";
import {
  generateChartMoment,
  generateWeeklyNarrative,
} from "@/lib/charts/weekly-chart-narrative";
import type {
  ChartMomentPayload,
  ChartType,
  WeeklyChartMoverDropout,
  WeeklyChartRankingApiRow,
  WeeklyChartRankingRow,
} from "@/lib/charts/weekly-chart-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { formatWeeklyChartWeekLabel } from "@/lib/charts/week-label";

export type WeeklyChartMoversApi = {
  biggest_jump: WeeklyChartRankingApiRow | null;
  biggest_drop: WeeklyChartRankingApiRow | HydratedWeeklyChartDropout | null;
  best_new_entry: WeeklyChartRankingApiRow | null;
};

export type WeeklyChartApiResult = {
  week_start: string;
  week_end: string;
  chart_type: ChartType;
  rankings: WeeklyChartRankingApiRow[];
  movers: WeeklyChartMoversApi;
  /** Same structure as `movers` (alias for API consumers). */
  biggest_movers: WeeklyChartMoversApi;
  narrative: string[];
  chart_moment: ChartMomentPayload;
  share: {
    weekLabel: string;
    topFive: WeeklyChartRankingApiRow[];
    numberOne: WeeklyChartRankingApiRow | null;
  };
  /** Community weekly chart API: next Sunday 00:00 UTC ritual drop. */
  next_chart_drop_iso?: string | null;
  /** Community: members with ≥1 logged play in the chart window (denominator for %). */
  community_active_users?: number | null;
  /** Community: requesting user had ≥1 play in the window (for share copy). */
  viewer_contributed?: boolean;
};

export type LatestWeeklyChartApiResult = WeeklyChartApiResult;

function pickEnriched(
  row: WeeklyChartRankingRow | null,
  enriched: WeeklyChartRankingApiRow[],
): WeeklyChartRankingApiRow | null {
  if (!row) return null;
  return enriched.find((h) => h.entity_id === row.entity_id) ?? null;
}

function mergeMoverMovement(
  picked: WeeklyChartRankingApiRow | null,
  source: WeeklyChartRankingRow | null,
): WeeklyChartRankingApiRow | null {
  if (!picked || !source) return picked;
  return {
    ...picked,
    movement: source.movement,
    prev_rank: source.prev_rank,
  };
}

function filterKnownRankings(rows: WeeklyChartRankingRow[]): WeeklyChartRankingRow[] {
  return rows.filter((r) => !isUnknownWeeklyChartEntityId(r.entity_id));
}

function parseRankings(raw: unknown): WeeklyChartRankingRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as WeeklyChartRankingRow[];
}

function isMoverDropout(
  x: WeeklyChartRankingRow | WeeklyChartMoverDropout | null,
): x is WeeklyChartMoverDropout {
  return x != null && "kind" in x && x.kind === "dropout";
}

/**
 * Latest or a specific week (match `week_start` exactly as stored, ISO string).
 */
export async function getWeeklyChartForUser(args: {
  userId: string;
  chartType: ChartType;
  weekStart?: string | null;
}): Promise<WeeklyChartApiResult | null> {
  const admin = createSupabaseAdminClient();
  const weekKey = args.weekStart?.trim();

  let query = admin
    .from("user_weekly_charts")
    .select("week_start, week_end, chart_type, rankings")
    .eq("user_id", args.userId)
    .eq("chart_type", args.chartType);

  if (weekKey) {
    query = query.eq("week_start", weekKey);
  } else {
    query = query.order("week_start", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn("[weekly-chart] get chart", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as {
    week_start: string;
    week_end: string;
    chart_type: ChartType;
    rankings: unknown;
  };

  const rankingsRaw = parseRankings(row.rankings);
  const hydrated = await hydrateWeeklyChartRankings(
    args.chartType,
    rankingsRaw,
  );
  const hydratedVisible = hydrated.filter((r) => !isUnknownWeeklyChartRow(r));
  const enriched = enrichWeeklyChartApiRows(hydratedVisible);

  const currentKnown = filterKnownRankings(rankingsRaw);

  const weekStartDate = new Date(row.week_start);
  const prevWeekStart = new Date(weekStartDate);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  const { data: prevRow } = await admin
    .from("user_weekly_charts")
    .select("rankings")
    .eq("user_id", args.userId)
    .eq("chart_type", args.chartType)
    .eq("week_start", prevWeekStart.toISOString())
    .maybeSingle();

  const prevRankings = filterKnownRankings(
    parseRankings((prevRow as { rankings?: unknown } | null)?.rankings),
  );

  const moversRaw = computeBiggestMovers(currentKnown, prevRankings);
  const weekLabel = formatWeeklyChartWeekLabel(row.week_start, row.week_end);

  let biggest_drop: WeeklyChartRankingApiRow | HydratedWeeklyChartDropout | null =
    null;
  if (isMoverDropout(moversRaw.biggest_drop)) {
    biggest_drop = await hydrateWeeklyChartDropout(
      args.chartType,
      moversRaw.biggest_drop,
    );
  } else {
    biggest_drop = mergeMoverMovement(
      pickEnriched(moversRaw.biggest_drop, enriched),
      moversRaw.biggest_drop,
    );
  }

  const movers: WeeklyChartMoversApi = {
    biggest_jump: mergeMoverMovement(
      pickEnriched(moversRaw.biggest_jump, enriched),
      moversRaw.biggest_jump,
    ),
    biggest_drop,
    best_new_entry: mergeMoverMovement(
      pickEnriched(moversRaw.best_new_entry, enriched),
      moversRaw.best_new_entry,
    ),
  };

  const narrative = generateWeeklyNarrative({
    chart_type: args.chartType,
    rankings: enriched,
  });

  const chart_moment = generateChartMoment({
    week_label: weekLabel,
    rankings: enriched,
  });

  const sortedByRank = [...enriched].sort((a, b) => a.rank - b.rank);
  const leader = sortedByRank[0] ?? null;

  return {
    week_start: row.week_start,
    week_end: row.week_end,
    chart_type: row.chart_type,
    rankings: enriched,
    movers,
    biggest_movers: movers,
    narrative,
    chart_moment,
    share: {
      weekLabel,
      topFive: sortedByRank.slice(0, 5),
      numberOne: leader,
    },
  };
}

export async function getLatestWeeklyChartForUser(args: {
  userId: string;
  chartType: ChartType;
}): Promise<WeeklyChartApiResult | null> {
  return getWeeklyChartForUser({
    userId: args.userId,
    chartType: args.chartType,
    weekStart: null,
  });
}

/** Latest week bounds only — for ack/dismiss flows that only need `week_start`. */
export async function getLatestWeeklyChartMetaForUser(args: {
  userId: string;
  chartType: ChartType;
}): Promise<{ week_start: string; week_end: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_weekly_charts")
    .select("week_start, week_end")
    .eq("user_id", args.userId)
    .eq("chart_type", args.chartType)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[weekly-chart] get latest meta", error.message);
    return null;
  }
  if (!data) return null;
  return data as { week_start: string; week_end: string };
}

export type BillboardWeeklyChartSnapshot = {
  week_start: string;
  week_end: string;
  weekLabel: string;
  numberOne: WeeklyChartRankingApiRow | null;
  newEntriesCount: number;
  biggestJump: WeeklyChartRankingApiRow | null;
};

/**
 * Minimal weekly chart payload for billboard drop (no narrative, moment, or full-rank hydration).
 */
export async function getBillboardWeeklyChartSnapshot(args: {
  userId: string;
  chartType: ChartType;
}): Promise<BillboardWeeklyChartSnapshot | null> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("user_weekly_charts")
    .select("week_start, week_end, chart_type, rankings")
    .eq("user_id", args.userId)
    .eq("chart_type", args.chartType)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[weekly-chart] billboard snapshot", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as {
    week_start: string;
    week_end: string;
    chart_type: ChartType;
    rankings: unknown;
  };

  const rankingsRaw = parseRankings(row.rankings);
  const currentKnown = filterKnownRankings(rankingsRaw);

  const weekStartDate = new Date(row.week_start);
  const prevWeekStart = new Date(weekStartDate);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  const { data: prevRow } = await admin
    .from("user_weekly_charts")
    .select("rankings")
    .eq("user_id", args.userId)
    .eq("chart_type", args.chartType)
    .eq("week_start", prevWeekStart.toISOString())
    .maybeSingle();

  const prevRankings = filterKnownRankings(
    parseRankings((prevRow as { rankings?: unknown } | null)?.rankings),
  );

  const moversRaw = computeBiggestMovers(currentKnown, prevRankings);
  const weekLabel = formatWeeklyChartWeekLabel(row.week_start, row.week_end);

  const sortedByRank = [...currentKnown].sort((a, b) => a.rank - b.rank);
  const leaderRow = sortedByRank[0] ?? null;

  const idsNeeded = new Set<string>();
  if (leaderRow) idsNeeded.add(leaderRow.entity_id);
  if (moversRaw.biggest_jump) {
    idsNeeded.add(moversRaw.biggest_jump.entity_id);
  }

  const slimRankings = rankingsRaw.filter((r) => idsNeeded.has(r.entity_id));
  const hydrated = await hydrateWeeklyChartRankings(args.chartType, slimRankings);
  const hydratedVisible = hydrated.filter((r) => !isUnknownWeeklyChartRow(r));
  const enriched = enrichWeeklyChartApiRows(hydratedVisible);

  const numberOne = leaderRow ? pickEnriched(leaderRow, enriched) : null;
  const biggestJump = moversRaw.biggest_jump
    ? mergeMoverMovement(
        pickEnriched(moversRaw.biggest_jump, enriched),
        moversRaw.biggest_jump,
      )
    : null;

  const newEntriesCount = currentKnown.filter((r) => r.is_new).length;

  return {
    week_start: row.week_start,
    week_end: row.week_end,
    weekLabel,
    numberOne,
    newEntriesCount,
    biggestJump,
  };
}

export type WeeklyChartWeekOption = {
  week_start: string;
  week_end: string;
};

/** Descending by week (newest first). */
export async function listWeeklyChartWeeksForUser(args: {
  userId: string;
  chartType: ChartType;
  limit?: number;
}): Promise<WeeklyChartWeekOption[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_weekly_charts")
    .select("week_start, week_end")
    .eq("user_id", args.userId)
    .eq("chart_type", args.chartType)
    .order("week_start", { ascending: false })
    .limit(args.limit ?? 104);

  if (error) {
    console.warn("[weekly-chart] list weeks", error.message);
    return [];
  }
  return (data ?? []) as WeeklyChartWeekOption[];
}
