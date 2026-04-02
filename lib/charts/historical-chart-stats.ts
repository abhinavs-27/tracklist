import type { WeeklyChartRankingRow } from "@/lib/charts/weekly-chart-types";

export type EntityHistoryRollup = {
  /** Weeks before current where entity appeared in top 10. */
  prior_weeks_in_top_10: number;
  prior_weeks_at_1: number;
  prior_peak_rank: number | null;
  /** Ever appeared in any prior week's top 10. */
  appeared_before: boolean;
};

/**
 * Scan prior stored charts (same user + type, week_start < current week).
 */
export function rollupEntityHistory(
  priorCharts: { rankings: WeeklyChartRankingRow[] }[],
  currentEntityIds: string[],
): Map<string, EntityHistoryRollup> {
  const byEntity = new Map<
    string,
    {
      weeks_in_top_10: number;
      weeks_at_1: number;
      ranks: number[];
    }
  >();

  for (const chart of priorCharts) {
    for (const row of chart.rankings) {
      let slot = byEntity.get(row.entity_id);
      if (!slot) {
        slot = { weeks_in_top_10: 0, weeks_at_1: 0, ranks: [] };
        byEntity.set(row.entity_id, slot);
      }
      slot.weeks_in_top_10 += 1;
      slot.ranks.push(row.rank);
      if (row.rank === 1) slot.weeks_at_1 += 1;
    }
  }

  const out = new Map<string, EntityHistoryRollup>();
  for (const id of currentEntityIds) {
    const slot = byEntity.get(id);
    if (!slot) {
      out.set(id, {
        prior_weeks_in_top_10: 0,
        prior_weeks_at_1: 0,
        prior_peak_rank: null,
        appeared_before: false,
      });
      continue;
    }
    out.set(id, {
      prior_weeks_in_top_10: slot.weeks_in_top_10,
      prior_weeks_at_1: slot.weeks_at_1,
      prior_peak_rank:
        slot.ranks.length > 0 ? Math.min(...slot.ranks) : null,
      appeared_before: slot.weeks_in_top_10 > 0,
    });
  }
  return out;
}
