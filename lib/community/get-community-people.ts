import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export type CommunityPersonRow = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalLogs: number;
  uniqueArtists: number;
  isCreator: boolean;
  role: "admin" | "member";
};

/**
 * All community members sorted by 7-day listen count DESC, 0-listen members last.
 * Uses the live leaderboard RPC (not the stale pre-computed table).
 */
export async function getCommunityPeople(
  communityId: string,
): Promise<CommunityPersonRow[]> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return [];

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // 1. All community members with profiles
  const { data: members, error: mErr } = await admin
    .from("community_members")
    .select("user_id, role, users!inner(id, username, avatar_url, created_at)")
    .eq("community_id", cid);

  if (mErr) {
    console.error("[community] people members failed", mErr);
    return [];
  }

  // 2. Creator = oldest admin
  const { data: community } = await admin
    .from("communities")
    .select("created_by")
    .eq("id", cid)
    .single();
  const creatorId = (community as { created_by: string } | null)?.created_by ?? null;

  // 3. Live listen stats from RPC
  const { data: agg } = await admin.rpc("get_community_weekly_leaderboard", {
    p_community_id: cid,
    p_since: since,
  });

  const statsMap = new Map<string, { totalLogs: number; uniqueArtists: number }>();
  for (const r of (agg ?? []) as { user_id: string; total_logs: number; unique_artists: number }[]) {
    statsMap.set(r.user_id, {
      totalLogs: Number(r.total_logs),
      uniqueArtists: Number(r.unique_artists),
    });
  }

  // 4. Merge
  const result: CommunityPersonRow[] = ((members ?? []) as {
    user_id: string;
    role: string;
    users: { id: string; username: string; avatar_url: string | null };
  }[]).map((m) => {
    const stats = statsMap.get(m.user_id) ?? { totalLogs: 0, uniqueArtists: 0 };
    return {
      userId: m.user_id,
      username: m.users.username,
      avatarUrl: m.users.avatar_url,
      totalLogs: stats.totalLogs,
      uniqueArtists: stats.uniqueArtists,
      isCreator: m.user_id === creatorId,
      role: (m.role as "admin" | "member") ?? "member",
    };
  });

  // Sort: listeners first by count DESC, then non-listeners by username
  result.sort((a, b) => {
    if (a.totalLogs !== b.totalLogs) return b.totalLogs - a.totalLogs;
    return a.username.localeCompare(b.username);
  });

  return result;
}
