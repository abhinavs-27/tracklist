import "server-only";

import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

async function getUserIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const seen = new Set<string>();
  let from = 0;
  const PAGE = 5000;
  for (;;) {
    const { data, error } = await admin
      .from("logs")
      .select("user_id")
      .gte("listened_at", startIso)
      .lt("listened_at", endExclusiveIso)
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn("[weekly-chart] distinct users", error.message);
      break;
    }
    const rows = data ?? [];
    for (const r of rows) {
      seen.add((r as { user_id: string }).user_id);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return [...seen];
}

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * Weekly cron: compute charts for every user with ≥1 play in the completed week.
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
