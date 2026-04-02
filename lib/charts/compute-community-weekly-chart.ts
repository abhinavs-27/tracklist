import "server-only";

import { aggregateCommunityWeeklyTop10WithMetrics } from "@/lib/charts/aggregate-community-weekly-top-10";
import { computeCommunityRankMovement } from "@/lib/charts/community-chart-rank-movement";
import { rollupEntityHistory } from "@/lib/charts/historical-chart-stats";
import type {
  ChartType,
  WeeklyChartRankingRow,
} from "@/lib/charts/weekly-chart-types";
import { WEEKLY_CHART_OFF_RANK } from "@/lib/charts/weekly-chart-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function mapDbChartType(t: ChartType): "tracks" | "artists" | "albums" {
  return t;
}

function parseRankings(raw: unknown): WeeklyChartRankingRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as WeeklyChartRankingRow[];
}

/**
 * Compute and upsert one community’s weekly chart for [weekStart, weekEndExclusive).
 * Includes community listen metrics per row. When `skipIfSealed` is true (default), existing
 * sealed rows are left unchanged (weekly ritual / immutable publish).
 */
export async function computeCommunityWeeklyChart(args: {
  communityId: string;
  weekStart: Date;
  weekEndExclusive: Date;
  chartType: ChartType;
  /** Default true: skip if row already sealed (cron). Set false for backfill. */
  skipIfSealed?: boolean;
}): Promise<{ rankings: WeeklyChartRankingRow[]; skipped: boolean }> {
  const skipIfSealed = args.skipIfSealed !== false;
  const startIso = args.weekStart.toISOString();
  const endExclusiveIso = args.weekEndExclusive.toISOString();

  const admin = createSupabaseAdminClient();
  const dbType = mapDbChartType(args.chartType);

  const { data: existingSeal } = await admin
    .from("community_weekly_charts")
    .select("sealed_at")
    .eq("community_id", args.communityId)
    .eq("chart_type", dbType)
    .eq("week_start", args.weekStart.toISOString())
    .maybeSingle();

  const sealedAtExisting = (existingSeal as { sealed_at?: string | null } | null)
    ?.sealed_at;
  if (skipIfSealed && sealedAtExisting) {
    return { rankings: [], skipped: true };
  }

  const top = await aggregateCommunityWeeklyTop10WithMetrics({
    communityId: args.communityId,
    startIso,
    endExclusiveIso,
    chartType: args.chartType,
  });

  if (top.length === 0) {
    return { rankings: [], skipped: true };
  }

  const prevWeekStart = new Date(args.weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  const { data: prevRow } = await admin
    .from("community_weekly_charts")
    .select("rankings")
    .eq("community_id", args.communityId)
    .eq("chart_type", dbType)
    .eq("week_start", prevWeekStart.toISOString())
    .maybeSingle();

  const prevRankings = parseRankings(
    (prevRow as { rankings?: unknown } | null)?.rankings,
  );
  const prevRankByEntity = new Map<string, number>();
  for (const r of prevRankings) {
    prevRankByEntity.set(r.entity_id, r.rank);
  }

  const { data: priorCharts } = await admin
    .from("community_weekly_charts")
    .select("rankings")
    .eq("community_id", args.communityId)
    .eq("chart_type", dbType)
    .lt("week_start", args.weekStart.toISOString())
    .order("week_start", { ascending: true });

  const currentRows = top.map((row, i) => ({
    entity_id: row.entity_id,
    rank: i + 1,
    play_count: row.play_count,
  }));

  const history = rollupEntityHistory(
    (priorCharts ?? []).map((c) => ({
      rankings: parseRankings(
        (c as { rankings?: unknown }).rankings,
      ),
    })),
    currentRows.map((r) => r.entity_id),
  );

  const rankings: WeeklyChartRankingRow[] = top.map((agg, i) => {
    const row = {
      entity_id: agg.entity_id,
      rank: i + 1,
      play_count: agg.play_count,
    };
    const inPrev = prevRankByEntity.has(row.entity_id);
    const prev_rank = inPrev ? prevRankByEntity.get(row.entity_id)! : null;
    const mv = computeCommunityRankMovement({
      current_rank: row.rank,
      previous_rank: prev_rank,
    });
    const movement =
      mv.rank_movement === "NEW"
        ? WEEKLY_CHART_OFF_RANK - row.rank
        : mv.movement_numeric ?? 0;

    const h = history.get(row.entity_id)!;
    const is_new = !h.appeared_before;
    const is_reentry = h.appeared_before && !inPrev;

    const weeks_in_top_10 = h.prior_weeks_in_top_10 + 1;
    const weeks_at_1 =
      h.prior_weeks_at_1 + (row.rank === 1 ? 1 : 0);
    const peak_rank = Math.min(
      row.rank,
      h.prior_peak_rank ?? row.rank,
    );

    return {
      entity_id: row.entity_id,
      rank: row.rank,
      play_count: row.play_count,
      prev_rank,
      movement,
      rank_movement: mv.rank_movement,
      rank_delta: mv.rank_delta,
      is_new,
      is_reentry,
      weeks_in_top_10,
      weeks_at_1,
      peak_rank,
      unique_listeners: agg.unique_listeners,
      community_active_users: agg.community_active_users,
      community_listen_percent: agg.community_listen_percent,
      repeat_strength: agg.repeat_strength,
      top_contributors: agg.top_contributors,
    };
  });

  const sealedAt = sealedAtExisting ?? new Date().toISOString();

  const { error } = await admin.from("community_weekly_charts").upsert(
    {
      community_id: args.communityId,
      week_start: args.weekStart.toISOString(),
      week_end: args.weekEndExclusive.toISOString(),
      chart_type: dbType,
      rankings,
      sealed_at: sealedAt,
    },
    { onConflict: "community_id,week_start,chart_type" },
  );

  if (error) {
    console.error("[community-weekly-chart] upsert", error.message);
    throw error;
  }

  return { rankings, skipped: false };
}
