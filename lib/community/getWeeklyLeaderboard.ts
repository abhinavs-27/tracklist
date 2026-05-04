import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export type CommunityLeaderboardRow = {
  userId: string;
  username: string;
  avatar_url: string | null;
  totalLogs: number;
  uniqueArtists: number;
  streakDays: number;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function longestStreakInWindow(
  daySet: Set<string>,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = new Date(rangeStart + "T00:00:00.000Z");
  const end = new Date(rangeEnd + "T00:00:00.000Z");
  let best = 0;
  let cur = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    if (daySet.has(key)) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

/**
 * Weekly stats for leaderboard: last 7 days of logs, members only.
 * Uses DB-level GROUP BY — no 40k row limit, fully accurate counts.
 */
export async function getWeeklyLeaderboard(
  communityId: string,
): Promise<CommunityLeaderboardRow[]> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return [];

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const rangeStart = since.slice(0, 10);
  const rangeEnd = new Date().toISOString().slice(0, 10);

  const { data: agg, error: aggErr } = await admin.rpc(
    "get_community_weekly_leaderboard",
    { p_community_id: cid, p_since: since },
  );

  if (aggErr) {
    console.error("[community] leaderboard rpc failed", aggErr);
    return [];
  }

  const rows = (agg ?? []) as {
    user_id: string;
    total_logs: number;
    unique_artists: number;
    listen_days: string[] | null;
  }[];

  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: users, error: uErr } = await admin
    .from("users")
    .select("id, username, avatar_url")
    .in("id", userIds);
  if (uErr) console.error("[community] leaderboard users failed", uErr);

  const userMap = new Map(
    ((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map(
      (u) => [u.id, { username: u.username, avatar_url: u.avatar_url }],
    ),
  );

  const result: CommunityLeaderboardRow[] = rows.map((r) => {
    const daySet = new Set((r.listen_days ?? []).map(dayKey));
    const streakDays = longestStreakInWindow(daySet, rangeStart, rangeEnd);
    const u = userMap.get(r.user_id);
    return {
      userId: r.user_id,
      username: u?.username ?? "Unknown",
      avatar_url: u?.avatar_url ?? null,
      totalLogs: Number(r.total_logs),
      uniqueArtists: Number(r.unique_artists),
      streakDays,
    };
  });

  result.sort((a, b) => b.totalLogs - a.totalLogs);
  return result;
}
