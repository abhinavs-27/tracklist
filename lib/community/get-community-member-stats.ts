import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchUserMap } from "@/lib/queries";

export type CommunityMemberStatRow = {
  userId: string;
  username: string;
  avatar_url: string | null;
  listen_count_7d: number;
  unique_artists_7d: number;
  current_streak: number;
  longest_streak: number;
  max_streak_in_community: number;
  roles: { role_type: "champion" | "on_fire" | "explorer"; label: string }[];
};

const ROLE_LABEL: Record<string, string> = {
  champion: "Champion",
  on_fire: "On Fire",
  explorer: "Explorer",
};

/**
 * Per-member stats + streaks from `community_member_stats` and `user_streaks` snapshot,
 * plus weekly badges from `community_member_roles`.
 */
export async function getCommunityMemberStatsWithRoles(
  communityId: string,
): Promise<CommunityMemberStatRow[]> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return [];

  const { data: stats, error: sErr } = await admin
    .from("community_member_stats")
    .select(
      "user_id, listen_count_7d, unique_artists_7d, current_streak, longest_streak, max_streak_in_community",
    )
    .eq("community_id", cid);

  if (sErr || !stats?.length) return [];

  const { data: roles } = await admin
    .from("community_member_roles")
    .select("user_id, role_type")
    .eq("community_id", cid);

  const rolesByUser = new Map<string, ("champion" | "on_fire" | "explorer")[]>();
  for (const r of roles ?? []) {
    const row = r as { user_id: string; role_type: string };
    const rt = row.role_type;
    if (rt !== "champion" && rt !== "on_fire" && rt !== "explorer") continue;
    const arr = rolesByUser.get(row.user_id) ?? [];
    arr.push(rt);
    rolesByUser.set(row.user_id, arr);
  }

  const userIds = (stats as { user_id: string }[]).map((s) => s.user_id);
  const userMap = await fetchUserMap(admin, userIds);

  return (stats as {
    user_id: string;
    listen_count_7d: number;
    unique_artists_7d: number;
    current_streak: number;
    longest_streak: number;
    max_streak_in_community: number;
  }[])
    .map((s) => {
      const u = userMap.get(s.user_id);
      const roleTypes = rolesByUser.get(s.user_id) ?? [];
      return {
        userId: s.user_id,
        username: u?.username ?? "Unknown",
        avatar_url: u?.avatar_url ?? null,
        listen_count_7d: s.listen_count_7d,
        unique_artists_7d: s.unique_artists_7d,
        current_streak: s.current_streak,
        longest_streak: s.longest_streak,
        max_streak_in_community: s.max_streak_in_community,
        roles: roleTypes.map((role_type) => ({
          role_type,
          label: ROLE_LABEL[role_type] ?? role_type,
        })),
      };
    })
    .sort((a, b) => b.listen_count_7d - a.listen_count_7d);
}
