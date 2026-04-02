import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { aggregateWeeklyTop10 } from "@/lib/charts/aggregate-weekly-top-10";
import { rollupEntityHistory } from "@/lib/charts/historical-chart-stats";
import type {
  ChartType,
  WeeklyChartRankingRow,
} from "@/lib/charts/weekly-chart-types";
import { WEEKLY_CHART_OFF_RANK } from "@/lib/charts/weekly-chart-types";

function mapDbChartType(t: ChartType): "tracks" | "artists" | "albums" {
  return t;
}

function parseRankings(raw: unknown): WeeklyChartRankingRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as WeeklyChartRankingRow[];
}

/**
 * Compute and upsert one user's weekly chart for [weekStart, weekEndExclusive).
 */
export async function computeWeeklyChart(args: {
  userId: string;
  weekStart: Date;
  weekEndExclusive: Date;
  chartType: ChartType;
}): Promise<{ rankings: WeeklyChartRankingRow[]; skipped: boolean }> {
  const startIso = args.weekStart.toISOString();
  const endExclusiveIso = args.weekEndExclusive.toISOString();

  const top = await aggregateWeeklyTop10({
    userId: args.userId,
    startIso,
    endExclusiveIso,
    chartType: args.chartType,
  });

  if (top.length === 0) {
    return { rankings: [], skipped: true };
  }

  const admin = createSupabaseAdminClient();
  const dbType = mapDbChartType(args.chartType);

  const prevWeekStart = new Date(args.weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);

  const { data: prevRow } = await admin
    .from("user_weekly_charts")
    .select("rankings")
    .eq("user_id", args.userId)
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
    .from("user_weekly_charts")
    .select("rankings")
    .eq("user_id", args.userId)
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

  const rankings: WeeklyChartRankingRow[] = currentRows.map((row) => {
    const inPrev = prevRankByEntity.has(row.entity_id);
    const prev_rank = inPrev ? prevRankByEntity.get(row.entity_id)! : null;
    const movement = inPrev
      ? prev_rank! - row.rank
      : WEEKLY_CHART_OFF_RANK - row.rank;

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
      is_new,
      is_reentry,
      weeks_in_top_10,
      weeks_at_1,
      peak_rank,
    };
  });

  const { error } = await admin.from("user_weekly_charts").upsert(
    {
      user_id: args.userId,
      week_start: args.weekStart.toISOString(),
      week_end: args.weekEndExclusive.toISOString(),
      chart_type: dbType,
      rankings,
    },
    { onConflict: "user_id,week_start,chart_type" },
  );

  if (error) {
    console.error("[weekly-chart] upsert", error.message);
    throw error;
  }

  return { rankings, skipped: false };
}
