import "server-only";

import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getLastCompletedWeekWindow } from "@/lib/charts/utc-week";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/**
 * Communities that had at least one listen from a member in the window.
 */
async function getCommunityIdsWithLogsInRange(
  startIso: string,
  endExclusiveIso: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const seen = new Set<string>();

  const { data: members, error: mErr } = await admin
    .from("community_members")
    .select("community_id, user_id");
  if (mErr) {
    console.warn("[community-weekly-chart] members scan", mErr.message);
    return [];
  }

  const byUser = new Map<string, string[]>();
  for (const row of members ?? []) {
    const r = row as { community_id: string; user_id: string };
    const list = byUser.get(r.user_id);
    if (list) list.push(r.community_id);
    else byUser.set(r.user_id, [r.community_id]);
  }

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
      console.warn("[community-weekly-chart] logs scan", error.message);
      break;
    }
    const batch = (data ?? []) as { user_id: string }[];
    for (const { user_id } of batch) {
      const comms = byUser.get(user_id);
      if (comms) {
        for (const c of comms) seen.add(c);
      }
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return [...seen];
}

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
