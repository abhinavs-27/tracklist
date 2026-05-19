import { getSupabase } from "../lib/supabase";

/** Enrich a list of users with is_following status for a viewer. */
export async function enrichUsersWithFollowStatus<T extends { id: string }>(
  users: T[],
  viewerId: string | null,
): Promise<(T & { is_following: boolean })[]> {
  if (!viewerId || users.length === 0) {
    return users.map((u) => ({ ...u, is_following: false }));
  }

  try {
    const supabase = getSupabase();
    const targetIds = users.map((u) => u.id);
    const CHUNK = 120;
    const followingIds: string[] = [];

    for (let i = 0; i < targetIds.length; i += CHUNK) {
      const chunk = targetIds.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .in("following_id", chunk);

      if (error) {
        console.error("[follow] enrichUsersWithFollowStatus chunk failed:", error);
        continue;
      }
      if (data) {
        followingIds.push(...data.map((f) => f.following_id));
      }
    }

    const followingSet = new Set(followingIds);
    return users.map((u) => ({
      ...u,
      is_following: followingSet.has(u.id),
    }));
  } catch (e) {
    console.error("[follow] enrichUsersWithFollowStatus failed:", e);
    return users.map((u) => ({ ...u, is_following: false }));
  }
}
