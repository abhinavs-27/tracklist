import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { backfillMissingLogCatalogFromTracks } from "@/lib/logs/backfill-log-catalog-from-tracks";
import { parseBillboardWeek } from "@/lib/jobs/week-window";
import { createJobsSupabaseClient } from "@/lib/jobs/service-role";
import { startJobRun } from "@/lib/jobs/job-logger";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * One user × one week: backfill log catalog for that slice (only if aggregates
 * are missing — i.e. this is a first-time compute), then upsert all three chart types.
 * Idempotent via `uq_user_weekly_charts_user_week_type`.
 */
export async function runGenerateUserBillboard(args: {
  userId: string;
  week?: string;
}): Promise<{ chartsWritten: number; skipped: number }> {
  const window =
    args.week != null
      ? parseBillboardWeek(args.week)
      : getLastCompletedWeekWindow(new Date());

  const startIso = window.weekStart.toISOString();
  const endIso = window.weekEndExclusive.toISOString();
  const weekStartDate = startIso.slice(0, 10);

  const run = await startJobRun("billboard_user", {
    user_id: args.userId,
    week_start: weekStartDate,
  });

  try {
    const admin = createJobsSupabaseClient();
    const { count } = await admin
      .from("user_listening_aggregates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("week_start", weekStartDate)
      .limit(1);

    const fastPath = (count ?? 0) > 0;

    if (!fastPath) {
      await backfillMissingLogCatalogFromTracks({
        startIso,
        endExclusiveIso: endIso,
        userIds: [args.userId],
      });
    }

    const results = await Promise.all(
      CHART_TYPES.map((chartType) =>
        computeWeeklyChart({
          userId: args.userId,
          weekStart: window.weekStart,
          weekEndExclusive: window.weekEndExclusive,
          chartType,
        }),
      ),
    );

    const chartsWritten = results.filter((r) => !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    await run.finish({ status: "ok", fast_path: fastPath, items_ok: chartsWritten, items_failed: skipped });
    return { chartsWritten, skipped };
  } catch (e) {
    await run.finish({ status: "error" });
    throw e;
  }
}

/**
 * One community × one week: upsert all three chart types.
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

  const weekStartDate = window.weekStart.toISOString().slice(0, 10);
  const run = await startJobRun("billboard_community", {
    community_id: args.communityId,
    week_start: weekStartDate,
  });

  try {
    const results = await Promise.all(
      CHART_TYPES.map((chartType) =>
        computeCommunityWeeklyChart({
          communityId: args.communityId,
          weekStart: window.weekStart,
          weekEndExclusive: window.weekEndExclusive,
          chartType,
        }),
      ),
    );

    const chartsWritten = results.filter((r) => !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;

    await run.finish({ status: "ok", items_ok: chartsWritten, items_failed: skipped });
    return { chartsWritten, skipped };
  } catch (e) {
    await run.finish({ status: "error" });
    throw e;
  }
}
