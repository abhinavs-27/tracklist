import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { backfillMissingLogCatalogFromTracks } from "@/lib/logs/backfill-log-catalog-from-tracks";
import { parseBillboardWeek } from "@/lib/jobs/week-window";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * One user × one week: backfill log catalog for that slice, then upsert all three chart types.
 * Idempotent via `uq_user_weekly_charts_user_week_type`.
 */
export async function runGenerateUserBillboard(args: {
  userId: string;
  /** Defaults to last completed week when omitted (e.g. manual replay). */
  week?: string;
}): Promise<{ chartsWritten: number; skipped: number }> {
  const window =
    args.week != null
      ? parseBillboardWeek(args.week)
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();

  await backfillMissingLogCatalogFromTracks({
    startIso,
    endExclusiveIso: endIso,
    userIds: [args.userId],
  });

  let chartsWritten = 0;
  let skipped = 0;
  for (const chartType of CHART_TYPES) {
    const { skipped: sk } = await computeWeeklyChart({
      userId: args.userId,
      weekStart: window.weekStart,
      weekEndExclusive: window.weekEndExclusive,
      chartType,
    });
    if (sk) skipped += 1;
    else chartsWritten += 1;
  }

  return { chartsWritten, skipped };
}

/**
 * One community × one week: upsert all three chart types (rankings use existing aggregate:
 * unique listeners + capped plays baked into `aggregateCommunityWeeklyTop10WithMetrics`).
 * Idempotent via `uq_community_weekly_charts_community_week_type`.
 */
export async function runGenerateCommunityBillboard(args: {
  communityId: string;
  week?: string;
}): Promise<{ chartsWritten: number; skipped: number }> {
  const window =
    args.week != null
      ? parseBillboardWeek(args.week)
      : getLastCompletedWeekWindow(new Date());

  let chartsWritten = 0;
  let skipped = 0;
  for (const chartType of CHART_TYPES) {
    const { skipped: sk } = await computeCommunityWeeklyChart({
      communityId: args.communityId,
      weekStart: window.weekStart,
      weekEndExclusive: window.weekEndExclusive,
      chartType,
    });
    if (sk) skipped += 1;
    else chartsWritten += 1;
  }

  return { chartsWritten, skipped };
}
