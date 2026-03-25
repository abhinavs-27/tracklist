import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_ROWS = 40000;

export type CommunityLeaderboardRow = {
  userId: string;
  username: string;
  avatar_url: string | null;
  totalLogs: number;
  uniqueArtists: number;
  streakDays: number;
};

type LogRow = {
  user_id: string;
  listened_at: string;
  artist_id: string | null;
  track_id: string | null;
};

async function fetchSongsArtistIds(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(trackIds)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("songs")
      .select("id, artist_id")
      .in("id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const r = row as { id: string; artist_id: string };
      out.set(r.id, r.artist_id);
    }
  }
  return out;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function longestStreakInWindow(
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
 * Sorted by totalLogs descending.
 */
export async function getWeeklyLeaderboard(
  communityId: string,
): Promise<CommunityLeaderboardRow[]> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return [];

  const { data: members, error: memErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);
  if (memErr || !members?.length) return [];

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return [];

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .in("user_id", memberIds)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (logErr) {
    console.error("[community] leaderboard logs failed", logErr);
    return [];
  }

  const logs = (logRows ?? []) as LogRow[];
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsArtistIds(admin, trackIds);

  const byUser = new Map<
    string,
    {
      totalLogs: number;
      artists: Set<string>;
      days: Set<string>;
    }
  >();

  for (const uid of memberIds) {
    byUser.set(uid, { totalLogs: 0, artists: new Set(), days: new Set() });
  }

  for (const log of logs) {
    const uid = log.user_id;
    const bucket = byUser.get(uid);
    if (!bucket) continue;
    bucket.totalLogs += 1;
    bucket.days.add(dayKey(log.listened_at));
    const aid =
      log.artist_id?.trim() ||
      (log.track_id ? songMap.get(log.track_id) : undefined);
    if (aid) bucket.artists.add(aid);
  }

  const rangeStart = since.slice(0, 10);
  const rangeEnd = new Date().toISOString().slice(0, 10);

  const { data: users, error: uErr } = await admin
    .from("users")
    .select("id, username, avatar_url")
    .in("id", memberIds);
  if (uErr) {
    console.error("[community] leaderboard users failed", uErr);
  }
  const userMap = new Map(
    (users ?? []).map((u: { id: string; username: string; avatar_url: string | null }) => [
      u.id,
      { username: u.username, avatar_url: u.avatar_url },
    ]),
  );

  const rows: CommunityLeaderboardRow[] = memberIds.map((userId) => {
    const b = byUser.get(userId)!;
    const streakDays = longestStreakInWindow(b.days, rangeStart, rangeEnd);
    const u = userMap.get(userId);
    return {
      userId,
      username: u?.username ?? "Unknown",
      avatar_url: u?.avatar_url ?? null,
      totalLogs: b.totalLogs,
      uniqueArtists: b.artists.size,
      streakDays,
    };
  });

  rows.sort((a, b) => b.totalLogs - a.totalLogs);
  return rows;
}
