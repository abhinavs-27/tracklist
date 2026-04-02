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
  generateCommunityWeeklyNarrative,
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
import { nextUtcSundayMidnightAfter } from "@/lib/charts/next-chart-drop";
import type {
  WeeklyChartApiResult,
  WeeklyChartMoversApi,
} from "@/lib/charts/get-user-weekly-chart";

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
    rank_movement: source.rank_movement,
    rank_delta: source.rank_delta,
  };
}

function attachCommunityBreakdown(
  r: WeeklyChartRankingApiRow,
): WeeklyChartRankingApiRow {
  const hasCommunity =
    r.rank_movement != null ||
    r.community_listen_percent != null ||
    r.repeat_strength != null ||
    (r.top_contributors != null && r.top_contributors.length > 0);
  if (!hasCommunity) return r;
  return {
    ...r,
    community_breakdown: {
      percent_of_community: r.community_listen_percent ?? null,
      total_plays: r.play_count,
      repeat_strength: r.repeat_strength ?? null,
      top_contributors: r.top_contributors ?? [],
    },
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

async function countViewerPlaysInWeekWindow(args: {
  userId: string;
  startIso: string;
  endExclusiveIso: string;
}): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("listened_at", args.startIso)
    .lt("listened_at", args.endExclusiveIso);
  if (error) {
    console.warn("[community-weekly-chart] viewer plays", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Latest or a specific week for a community (match `week_start` exactly as stored).
 */
export async function getCommunityWeeklyChart(args: {
  communityId: string;
  chartType: ChartType;
  weekStart?: string | null;
  /** When set, response includes `viewer_contributed` (any listen in the chart window). */
  viewerId?: string | null;
}): Promise<WeeklyChartApiResult | null> {
  const admin = createSupabaseAdminClient();
  const weekKey = args.weekStart?.trim();

  let query = admin
    .from("community_weekly_charts")
    .select("week_start, week_end, chart_type, rankings")
    .eq("community_id", args.communityId)
    .eq("chart_type", args.chartType);

  if (weekKey) {
    query = query.eq("week_start", weekKey);
  } else {
    query = query.order("week_start", { ascending: false }).limit(1);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn("[community-weekly-chart] get chart", error.message);
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
  const enriched = enrichWeeklyChartApiRows(hydratedVisible).map(
    attachCommunityBreakdown,
  );

  const currentKnown = filterKnownRankings(rankingsRaw);

  const weekStartDate = new Date(row.week_start);
  const prevWeekStart = new Date(weekStartDate);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  const { data: prevRow } = await admin
    .from("community_weekly_charts")
    .select("rankings")
    .eq("community_id", args.communityId)
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

  const narrative = generateCommunityWeeklyNarrative({
    chart_type: args.chartType,
    rankings: enriched,
  });

  const chart_moment: ChartMomentPayload = generateChartMoment({
    week_label: weekLabel,
    rankings: enriched,
  });

  const sortedByRank = [...enriched].sort((a, b) => a.rank - b.rank);
  const leader = sortedByRank[0] ?? null;

  const community_active_users =
    sortedByRank.find((r) => r.community_active_users != null)
      ?.community_active_users ?? null;

  let viewer_contributed: boolean | undefined;
  const vid = args.viewerId?.trim();
  if (vid) {
    const n = await countViewerPlaysInWeekWindow({
      userId: vid,
      startIso: row.week_start,
      endExclusiveIso: row.week_end,
    });
    viewer_contributed = n > 0;
  }

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
    next_chart_drop_iso: nextUtcSundayMidnightAfter(new Date()).toISOString(),
    community_active_users,
    viewer_contributed,
  };
}

export type CommunityWeeklyChartWeekOption = {
  week_start: string;
  week_end: string;
};

export async function listCommunityWeeklyChartWeeks(args: {
  communityId: string;
  chartType: ChartType;
  limit?: number;
}): Promise<CommunityWeeklyChartWeekOption[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_weekly_charts")
    .select("week_start, week_end")
    .eq("community_id", args.communityId)
    .eq("chart_type", args.chartType)
    .order("week_start", { ascending: false })
    .limit(args.limit ?? 104);

  if (error) {
    console.warn("[community-weekly-chart] list weeks", error.message);
    return [];
  }
  return (data ?? []) as CommunityWeeklyChartWeekOption[];
}
