import type {
  HydratedWeeklyRankingRow,
} from "@/lib/charts/hydrate-weekly-chart";
import type { WeeklyChartRankingApiRow } from "@/lib/charts/weekly-chart-types";

export function enrichWeeklyChartApiRows(
  rows: HydratedWeeklyRankingRow[],
): WeeklyChartRankingApiRow[] {
  if (rows.length === 0) return [];
  const minRank = Math.min(...rows.map((r) => r.rank));
  return rows.map((r) => ({
    ...r,
    /** True for the best-ranked row in this response (Billboard #1 slot, or next if #1 was dropped). */
    is_number_one: r.rank === minRank,
    is_top_3: r.rank <= 3,
    has_positive_movement:
      r.rank_movement === "UP" ||
      (r.rank_movement == null && r.movement != null && r.movement > 0),
    has_negative_movement:
      r.rank_movement === "DOWN" ||
      (r.rank_movement == null && r.movement != null && r.movement < 0),
  }));
}
