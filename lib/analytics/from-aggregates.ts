/**
 * Query helpers that read from `user_listening_aggregates` instead of raw `logs`.
 *
 * All-time totals use `get_user_entity_totals` / `get_user_total_play_count` RPCs
 * so aggregation happens in Postgres, bypassing PostgREST's default 1000-row cap.
 *
 * Callers must use the admin client — the table has RLS disabled.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { utcWeekStartMonday } from "@/lib/analytics/date-buckets";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AggCount = { entity_id: string; count: number };

// ─── Week helpers ────────────────────────────────────────────────────────────

/** Current calendar week start (Monday, UTC). */
export function currentWeekStart(): string {
  return utcWeekStartMonday(new Date().toISOString());
}

/** The Monday before the current week start. */
export function previousWeekStart(): string {
  const cur = new Date(currentWeekStart());
  cur.setUTCDate(cur.getUTCDate() - 7);
  return cur.toISOString().slice(0, 10);
}

/** Two Mondays before the current week start. */
export function twoWeeksAgoStart(): string {
  const cur = new Date(currentWeekStart());
  cur.setUTCDate(cur.getUTCDate() - 14);
  return cur.toISOString().slice(0, 10);
}

// ─── Per-week queries (use the partial index on week_start) ──────────────────

export async function getWeeklyAgg(
  admin: SupabaseClient,
  userId: string,
  entityType: "artist" | "album" | "track" | "genre",
  weekStart: string,
  limit = 60,
): Promise<AggCount[]> {
  const { data, error } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, count")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("week_start", weekStart)
    .order("count", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[from-aggregates] getWeeklyAgg", entityType, error.message);
    return [];
  }
  return (data ?? []) as AggCount[];
}

// ─── All-time queries via RPC (avoids PostgREST row cap) ─────────────────────

/**
 * All-time play counts for a user's entity type, summed across all yearly
 * buckets — accurate for users with 100k+ listens.
 *
 * Uses `get_user_entity_totals` RPC so GROUP BY + SUM happen in Postgres,
 * not in application code after a truncated 1000-row fetch.
 */
export async function getAllTimeAgg(
  admin: SupabaseClient,
  userId: string,
  entityType: "artist" | "album" | "track" | "genre",
  limit = 50,
): Promise<AggCount[]> {
  const { data, error } = await admin.rpc("get_user_entity_totals", {
    p_user_id: userId,
    p_entity_type: entityType,
    p_limit: Math.min(limit, 10000),
  });

  if (error) {
    console.warn("[from-aggregates] getAllTimeAgg", entityType, error.message);
    return [];
  }

  return ((data ?? []) as { entity_id: string; total_count: number }[]).map(
    (r) => ({ entity_id: r.entity_id, count: r.total_count }),
  );
}

/**
 * True all-time total play count for a user.
 * Counts directly from the logs table — aggregates can be stale after recent listens.
 */
export async function getTotalPlayCount(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.warn("[from-aggregates] getTotalPlayCount", error.message);
    return 0;
  }

  return count ?? 0;
}
