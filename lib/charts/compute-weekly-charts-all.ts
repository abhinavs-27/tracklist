import "server-only";

import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { backfillMissingLogCatalogFromTracks } from "@/lib/logs/backfill-log-catalog-from-tracks";
import { getUserIdsWithLogsInRange } from "@/lib/charts/billboard-week-participants";

export { getUserIdsWithLogsInRange };

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * Weekly cron: compute charts for every user with ≥1 play in the completed week.
 * Also runs `backfillMissingLogCatalogFromTracks` for that week so `logs` have album/artist
 * FKs before the community billboard job (same schedule, later) aggregates member plays.
 */
export async function computeWeeklyChartsForAllUsers(options?: {
  weekStart?: Date;
  weekEndExclusive?: Date;
}): Promise<{
  weekStart: string;
  weekEndExclusive: string;
  users: number;
  chartsWritten: number;
}> {
  const window =
    options?.weekStart != null && options?.weekEndExclusive != null
      ? { weekStart: options.weekStart, weekEndExclusive: options.weekEndExclusive }
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();

  const catalogBf = await backfillMissingLogCatalogFromTracks({
    startIso,
    endExclusiveIso: endIso,
  });
  console.log("[cron] weekly-charts log catalog backfill", catalogBf);

  const userIds = await getUserIdsWithLogsInRange(startIso, endIso);

  let chartsWritten = 0;
  for (const userId of userIds) {
    for (const chartType of CHART_TYPES) {
      const { skipped } = await computeWeeklyChart({
        userId,
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
    users: userIds.length,
    chartsWritten,
  };
}
