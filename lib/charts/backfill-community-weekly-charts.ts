import "server-only";

import { computeCommunityWeeklyChart } from "@/lib/charts/compute-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import {
  getLastCompletedWeekWindow,
  utcSundayMidnightFromDate,
} from "@/lib/charts/utc-week";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

/** One chart week in UTC (Sunday → Sunday). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Safety cap so backfill always terminates (avoids runaway loops from date bugs or bad bounds).
 * ~48 years of weekly slots; raise via env if you truly need more history in one run.
 */
const DEFAULT_MAX_BACKFILL_WEEKS = 2500;

function maxBackfillWeeks(): number {
  const raw = process.env.COMMUNITY_WEEKLY_BACKFILL_MAX_WEEKS?.trim();
  if (!raw) return DEFAULT_MAX_BACKFILL_WEEKS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50_000) : DEFAULT_MAX_BACKFILL_WEEKS;
}

async function getCommunityListenBounds(
  communityId: string,
): Promise<{ min: Date; max: Date } | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_community_listen_time_bounds", {
    p_community_id: communityId,
  });
  if (error) {
    console.warn(
      "[community-weekly-chart-backfill] bounds rpc",
      error.message,
    );
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { min_listened_at?: string | null; max_listened_at?: string | null }
    | null
    | undefined;
  const minAt = row?.min_listened_at;
  const maxAt = row?.max_listened_at;
  if (!minAt || !maxAt) return null;
  return { min: new Date(minAt), max: new Date(maxAt) };
}

/**
 * All community ids (for full backfill).
 */
export async function getAllCommunityIds(): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const out: string[] = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await admin
      .from("communities")
      .select("id")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn("[community-weekly-chart-backfill] list communities", error.message);
      break;
    }
    const rows = (data ?? []) as { id: string }[];
    for (const r of rows) {
      if (r.id) out.push(r.id);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export type BackfillCommunityResult = {
  communityId: string;
  weekSlots: number;
  chartsWritten: number;
  chartSkips: number;
};

/**
 * Every completed chart week from first member listen through latest completed week (UTC).
 * Idempotent (upserts). Empty weeks skip insert like the incremental job.
 */
export async function backfillCommunityWeeklyChartsForCommunity(
  communityId: string,
  options?: { now?: Date },
): Promise<BackfillCommunityResult> {
  const now = options?.now ?? new Date();
  const bounds = await getCommunityListenBounds(communityId);
  if (!bounds) {
    return { communityId, weekSlots: 0, chartsWritten: 0, chartSkips: 0 };
  }

  /** Log FK backfill is done by `backfillWeeklyChartsFor*` / user weekly cron, not here. */

  const firstSunday = utcSundayMidnightFromDate(bounds.min);
  const { weekStart: lastCompletedWeekStart } = getLastCompletedWeekWindow(now);

  if (firstSunday.getTime() > lastCompletedWeekStart.getTime()) {
    return { communityId, weekSlots: 0, chartsWritten: 0, chartSkips: 0 };
  }

  let weekSlots = 0;
  let chartsWritten = 0;
  let chartSkips = 0;

  const startMs = firstSunday.getTime();
  const endMs = lastCompletedWeekStart.getTime();
  const cap = maxBackfillWeeks();

  for (let i = 0; ; i++) {
    if (i >= cap) {
      const nextT = startMs + i * WEEK_MS;
      if (nextT <= endMs) {
        console.error(
          "[community-weekly-chart-backfill] hit week cap — stopping early (set COMMUNITY_WEEKLY_BACKFILL_MAX_WEEKS if needed)",
          { communityId, cap, endIso: new Date(endMs).toISOString() },
        );
      }
      break;
    }

    const t = startMs + i * WEEK_MS;
    if (t > endMs) break;

    weekSlots += 1;
    const weekStart = new Date(t);
    const weekEndExclusive = new Date(t + WEEK_MS);

    for (const chartType of CHART_TYPES) {
      const { skipped } = await computeCommunityWeeklyChart({
        communityId,
        weekStart,
        weekEndExclusive,
        chartType,
        skipIfSealed: false,
      });
      if (skipped) chartSkips += 1;
      else chartsWritten += 1;
    }
  }

  return { communityId, weekSlots, chartsWritten, chartSkips };
}

export type BackfillAllCommunitiesResult = {
  distinctCommunities: number;
  communitiesProcessed: number;
  totalWeekSlots: number;
  totalChartsWritten: number;
  totalChartSkips: number;
  perCommunity: BackfillCommunityResult[];
};

/**
 * Full history backfill for all communities (or one when `communityId` is set).
 * **Within each community**, weeks oldest → newest.
 */
export async function backfillCommunityWeeklyChartsForAllCommunities(options?: {
  now?: Date;
  /** Smoke test: single community. */
  communityId?: string;
}): Promise<BackfillAllCommunitiesResult> {
  const now = options?.now ?? new Date();

  const communityIds = options?.communityId?.trim()
    ? [options.communityId.trim()]
    : await getAllCommunityIds();

  const perCommunity: BackfillCommunityResult[] = [];
  let totalWeekSlots = 0;
  let totalChartsWritten = 0;
  let totalChartSkips = 0;

  for (const communityId of communityIds) {
    const r = await backfillCommunityWeeklyChartsForCommunity(communityId, {
      now,
    });
    perCommunity.push(r);
    totalWeekSlots += r.weekSlots;
    totalChartsWritten += r.chartsWritten;
    totalChartSkips += r.chartSkips;
  }

  return {
    distinctCommunities: communityIds.length,
    communitiesProcessed: communityIds.length,
    totalWeekSlots,
    totalChartsWritten,
    totalChartSkips,
    perCommunity,
  };
}
