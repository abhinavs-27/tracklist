import "server-only";

import { computeWeeklyChart } from "@/lib/charts/compute-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import {
  getLastCompletedWeekWindow,
  utcSundayMidnightFromDate,
} from "@/lib/charts/utc-week";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CHART_TYPES: ChartType[] = ["tracks", "artists", "albums"];

async function getUserListenBounds(
  userId: string,
): Promise<{ min: Date; max: Date } | null> {
  const admin = createSupabaseAdminClient();
  const { data: minRow } = await admin
    .from("logs")
    .select("listened_at")
    .eq("user_id", userId)
    .order("listened_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: maxRow } = await admin
    .from("logs")
    .select("listened_at")
    .eq("user_id", userId)
    .order("listened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const minAt = (minRow as { listened_at?: string } | null)?.listened_at;
  const maxAt = (maxRow as { listened_at?: string } | null)?.listened_at;
  if (!minAt || !maxAt) return null;
  return { min: new Date(minAt), max: new Date(maxAt) };
}

/**
 * Full table scan: distinct `user_id` from `logs` (one-time backfill).
 */
export async function getAllDistinctLogUserIds(): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const seen = new Set<string>();
  let lastId: string | null = null;
  const PAGE = 5000;
  for (;;) {
    let q = admin
      .from("logs")
      .select("id, user_id")
      .order("id", { ascending: true })
      .limit(PAGE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) {
      console.warn("[weekly-chart-backfill] scan logs", error.message);
      break;
    }
    const rows = (data ?? []) as { id: string; user_id: string }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      seen.add(r.user_id);
    }
    lastId = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }
  return [...seen];
}

export type BackfillUserResult = {
  userId: string;
  weekSlots: number;
  chartsWritten: number;
  chartSkips: number;
};

/**
 * For one user: compute weekly charts for every completed chart week from their first listen
 * through the latest completed week (Sun–Sat UTC), in chronological order.
 * Idempotent (upserts). Weeks with no plays skip insert (same as incremental job).
 */
export async function backfillWeeklyChartsForUser(
  userId: string,
  options?: { now?: Date },
): Promise<BackfillUserResult> {
  const now = options?.now ?? new Date();
  const bounds = await getUserListenBounds(userId);
  if (!bounds) {
    return { userId, weekSlots: 0, chartsWritten: 0, chartSkips: 0 };
  }

  const firstSunday = utcSundayMidnightFromDate(bounds.min);
  const { weekStart: lastCompletedWeekStart } = getLastCompletedWeekWindow(now);

  if (firstSunday.getTime() > lastCompletedWeekStart.getTime()) {
    return { userId, weekSlots: 0, chartsWritten: 0, chartSkips: 0 };
  }

  let weekSlots = 0;
  let chartsWritten = 0;
  let chartSkips = 0;

  for (
    let w = new Date(firstSunday.getTime());
    w.getTime() <= lastCompletedWeekStart.getTime();
    w.setUTCDate(w.getUTCDate() + 7)
  ) {
    weekSlots += 1;
    const weekStart = new Date(w.getTime());
    const weekEndExclusive = new Date(w.getTime());
    weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);

    for (const chartType of CHART_TYPES) {
      const { skipped } = await computeWeeklyChart({
        userId,
        weekStart,
        weekEndExclusive,
        chartType,
      });
      if (skipped) chartSkips += 1;
      else chartsWritten += 1;
    }
  }

  return { userId, weekSlots, chartsWritten, chartSkips };
}

export type BackfillAllResult = {
  distinctUsers: number;
  usersProcessed: number;
  totalWeekSlots: number;
  totalChartsWritten: number;
  totalChartSkips: number;
  perUser: BackfillUserResult[];
};

/**
 * One-time (or rare) full history backfill for all users who have logs.
 * **Order:** users in arbitrary order; **within each user**, weeks oldest → newest.
 */
export async function backfillWeeklyChartsForAllUsers(options?: {
  now?: Date;
  /** If set, only this user (for testing). */
  userId?: string;
}): Promise<BackfillAllResult> {
  const now = options?.now ?? new Date();

  const userIds = options?.userId
    ? [options.userId]
    : await getAllDistinctLogUserIds();

  const perUser: BackfillUserResult[] = [];
  let totalWeekSlots = 0;
  let totalChartsWritten = 0;
  let totalChartSkips = 0;

  for (const userId of userIds) {
    const r = await backfillWeeklyChartsForUser(userId, { now });
    perUser.push(r);
    totalWeekSlots += r.weekSlots;
    totalChartsWritten += r.chartsWritten;
    totalChartSkips += r.chartSkips;
  }

  return {
    distinctUsers: userIds.length,
    usersProcessed: userIds.length,
    totalWeekSlots,
    totalChartsWritten,
    totalChartSkips,
    perUser,
  };
}
