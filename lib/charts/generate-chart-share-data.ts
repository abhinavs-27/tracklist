import type { WeeklyChartRankingRow } from "@/lib/charts/weekly-chart-types";

import { formatWeeklyChartWeekLabel } from "@/lib/charts/week-label";

export type ChartSharePayload = {
  topFive: WeeklyChartRankingRow[];
  numberOne: WeeklyChartRankingRow | null;
  weekLabel: string;
};

/** @deprecated Prefer `generateChartMoment` + hydrated API rows for share UI. */
export function generateChartShareData(chart: {
  week_start: string;
  week_end: string;
  rankings: WeeklyChartRankingRow[];
}): ChartSharePayload {
  const topFive = chart.rankings.slice(0, 5);
  const numberOne = chart.rankings.find((r) => r.rank === 1) ?? null;
  const weekLabel = formatWeeklyChartWeekLabel(
    chart.week_start,
    chart.week_end,
  );
  return { topFive, numberOne, weekLabel };
}
