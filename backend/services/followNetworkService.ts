import { getSupabase } from "../lib/supabase";

type BasicUser = { id: string; username: string; avatar_url: string | null };

/** Users who follow the given user, ordered by username. */
export async function getFollowerUsers(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<BasicUser[]> {
  try {
    const supabase = getSupabase();
    const from = offset;
    const to = offset + limit - 1;

    const { data: users, error } = await supabase
      .from("follows")
      .select("users:users!follower_id (id, username, avatar_url)")
      .eq("following_id", userId)
      .order("users(username)", { ascending: true })
      .range(from, to);

    if (error || !users?.length) return [];

    return (
      users as unknown as {
        users: { id: string; username: string; avatar_url: string | null };
      }[]
    )
      .map((row) => row.users)
      .filter((u) => u !== null)
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url ?? null,
      }));
  } catch (e) {
    console.error("[followNetwork] getFollowerUsers", e);
    return [];
  }
}

/** Users the given user is following, ordered by username. */
export async function getFollowingUsers(
  userId: string,
  limit = 100,
  offset = 0,
): Promise<BasicUser[]> {
  try {
    const supabase = getSupabase();
    const from = offset;
    const to = offset + limit - 1;

    const { data: users, error } = await supabase
      .from("follows")
      .select("users:users!following_id (id, username, avatar_url)")
      .eq("follower_id", userId)
      .order("users(username)", { ascending: true })
      .range(from, to);

    if (error || !users?.length) return [];

    return (
      users as unknown as {
        users: { id: string; username: string; avatar_url: string | null };
      }[]
    )
      .map((row) => row.users)
      .filter((u) => u !== null)
      .map((u) => ({
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url ?? null,
      }));
  } catch (e) {
    console.error("[followNetwork] getFollowingUsers", e);
    return [];
  }
}

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
      console.error("[followNetwork] enrichUsersWithFollowStatus", error);
      return users.map((u) => ({ ...u, is_following: false }));
    }

    const followingSet = new Set((follows ?? []).map((f) => f.following_id));
    return users.map((u) => ({
      ...u,
      is_following: followingSet.has(u.id),
    }));
  } catch (e) {
    console.error("[followNetwork] enrichUsersWithFollowStatus", e);
    return users.map((u) => ({ ...u, is_following: false }));
  }
}

export async function getFollowListWithStatus(
  userId: string,
  viewerId: string | null,
  type: "followers" | "following",
  options: { limit?: number; offset?: number } = {},
): Promise<
  {
    id: string;
    username: string;
    avatar_url: string | null;
    is_following: boolean;
  }[]
> {
  const { limit = 20, offset = 0 } = options;
  const users =
    type === "followers"
      ? await getFollowerUsers(userId, limit, offset)
      : await getFollowingUsers(userId, limit, offset);

  return enrichUsersWithFollowStatus(users, viewerId);
}
