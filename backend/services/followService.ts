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
    const { data: follows, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in(
        "following_id",
        users.map((u) => u.id),
      );

    if (error) {
      console.error("[follow] enrichUsersWithFollowStatus failed:", error);
      return users.map((u) => ({ ...u, is_following: false }));
    }

    const followingSet = new Set((follows ?? []).map((f) => f.following_id));
    return users.map((u) => ({
      ...u,
      is_following: followingSet.has(u.id),
    }));
  } catch (e) {
    console.error("[follow] enrichUsersWithFollowStatus failed:", e);
    return users.map((u) => ({ ...u, is_following: false }));
  }
}
