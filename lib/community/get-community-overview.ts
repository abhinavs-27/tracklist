import "server-only";

import type { WeeklyChartRankingRow } from "@/lib/charts/weekly-chart-types";
import { hydrateWeeklyChartRankings } from "@/lib/charts/hydrate-weekly-chart";
import {
  getCommunityWeeklySummaryWithTrend,
  type WeeklySummaryPayload,
} from "@/lib/community/get-community-weekly-summary";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUtcWeekStartDate } from "@/lib/week";

export type CommunityOverviewMeta = {
  weekly_week_start: string;
  prev_week_start: string;
};

export type CommunityOverviewPayload = {
  chart: {
    week_start: string;
    week_end: string;
    rankings: WeeklyChartRankingRow[];
  } | null;
  weekly_summary: {
    current: WeeklySummaryPayload | null;
    previous: WeeklySummaryPayload | null;
    trend: { genres: { gained: string[]; lost: string[] } } | null;
  };
  /** Members with at least one listen in the rolling 7d window (community_member_stats). */
  active_user_count: number;
  meta: CommunityOverviewMeta;
};

function parseRankings(raw: unknown): WeeklyChartRankingRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as WeeklyChartRankingRow[];
}

async function loadOverviewChartTracks(
  communityId: string,
  chartTopN: number,
): Promise<CommunityOverviewPayload["chart"]> {
  const admin = createSupabaseAdminClient();
  const n = Math.min(10, Math.max(1, chartTopN));
  const { data, error } = await admin
    .from("community_weekly_charts")
    .select("week_start, week_end, rankings")
    .eq("community_id", communityId)
    .eq("chart_type", "tracks")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[getCommunityOverview] chart", error.message);
    return null;
  }
  if (!data) return null;

  const row = data as {
    week_start: string;
    week_end: string;
    rankings: unknown;
  };
  const rankingsRaw = parseRankings(row.rankings).slice(0, n);
  const hydrated = await hydrateWeeklyChartRankings("tracks", rankingsRaw);
  return {
    week_start: row.week_start,
    week_end: row.week_end,
    rankings: hydrated,
  };
}

async function getCommunityActiveUserCount(
  communityId: string,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("community_member_stats")
    .select("user_id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .gt("listen_count_7d", 0);
  if (error) {
    console.warn("[getCommunityOverview] active_user_count", error.message);
    return 0;
  }
  return count ?? 0;
}

export type GetCommunityOverviewOptions = {
  chartTopN?: number;
  /** When set, merges `activity_local` onto current weekly summary (extra query inside weekly summary). */
  timeZone?: string;
};

/**
 * Parallel chart (top N), weekly summary bundle, and active-user count — no consensus, leaderboard, or feed.
 */
export async function getCommunityOverview(
  communityId: string,
  options?: GetCommunityOverviewOptions,
): Promise<CommunityOverviewPayload | null> {
  const cid = communityId?.trim();
  if (!cid) return null;

  const chartTopN = options?.chartTopN ?? 10;
  const tz = options?.timeZone;

  const thisWeek = getUtcWeekStartDate(new Date());
  const prevDate = new Date(`${thisWeek}T00:00:00.000Z`);
  prevDate.setUTCDate(prevDate.getUTCDate() - 7);
  const prevWeekStart = prevDate.toISOString().slice(0, 10);

  const meta: CommunityOverviewMeta = {
    weekly_week_start: thisWeek,
    prev_week_start: prevWeekStart,
  };

  const [chart, weekly_summary, active_user_count] = await Promise.all([
    loadOverviewChartTracks(cid, chartTopN),
    getCommunityWeeklySummaryWithTrend(cid, { timeZone: tz }),
    getCommunityActiveUserCount(cid),
  ]);

  return {
    chart,
    weekly_summary,
    active_user_count,
    meta,
  };
}
