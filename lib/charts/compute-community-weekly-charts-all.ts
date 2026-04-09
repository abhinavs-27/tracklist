import "server-only";

import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { getCommunityIdsWithLogsInRange } from "@/lib/charts/billboard-week-participants";

export { getCommunityIdsWithLogsInRange };

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * Weekly cron: compute community billboards for every community with ≥1 qualifying listen in the completed week.
 */
export async function computeCommunityWeeklyChartsForAll(options?: {
  weekStart?: Date;
  weekEndExclusive?: Date;
}): Promise<{
  weekStart: string;
  weekEndExclusive: string;
  communities: number;
  chartsWritten: number;
}> {
  const window =
    options?.weekStart != null && options?.weekEndExclusive != null
      ? { weekStart: options.weekStart, weekEndExclusive: options.weekEndExclusive }
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();

  /** Log `album_id` / `artist_id` backfill runs in `computeWeeklyChartsForAllUsers` (same cron, earlier). */
  const communityIds = await getCommunityIdsWithLogsInRange(startIso, endIso);

  let chartsWritten = 0;
  for (const communityId of communityIds) {
    for (const chartType of CHART_TYPES) {
      const { skipped } = await computeCommunityWeeklyChart({
        communityId,
        weekStart: window.weekStart,
        weekEndExclusive: window.weekEndExclusive,
        chartType,
      });
      if (!skipped) chartsWritten += 1;
    }
  }

  return {
    weekStart: startIso,
    weekEndExclusive: endIso,
    communities: communityIds.length,
    chartsWritten,
  };
}
