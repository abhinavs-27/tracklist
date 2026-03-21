import { Router } from "express";
import { getSession } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { getFavoriteAlbumsForUser } from "../services/favoriteAlbumsService";
import { getFollowListWithStatus } from "../services/followNetworkService";
import { clampLimit, isValidUsername, isValidUuid } from "../lib/validation";

/**
 * GET /api/users/:username — public profile (mirrors Next.js).
 * GET /api/users/:userId/favorites — favorite albums (mirrors web `getUserFavoriteAlbums`).
 * GET /api/users/:userId/lists — public lists summary.
 *
 * Register specific routes before `/:username`.
 */
export const usersRouter = Router();

usersRouter.get("/:userId/favorites", async (req, res) => {
  const userId = req.params.userId;
  if (!isValidUuid(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }
  try {
    const items = await getFavoriteAlbumsForUser(userId);
    res.status(200).json(items);
  } catch (e) {
    console.error("[users] favorites", e);
    res.status(500).json({ error: "Failed to load favorites" });
  }
});

usersRouter.get("/:userId/lists", async (req, res) => {
  const userId = req.params.userId;
  if (!isValidUuid(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }
  try {
    const supabase = getSupabase();
    const { data: listRows, error: listError } = await supabase
      .from("lists")
      .select(
        "id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(0, 49);

    if (listError) {
      console.error("[users] lists", listError);
      res.status(500).json({ error: "Failed to load lists" });
      return;
    }
    if (!listRows?.length) {
      res.status(200).json({ lists: [] });
      return;
    }

    const listIds = listRows.map((l) => l.id as string);
    const { data: countData } = await supabase.rpc("get_list_item_counts", {
      p_list_ids: listIds,
    });

    const countByList = new Map<string, number>();
    for (const row of (countData ?? []) as {
      list_id: string;
      item_count: number;
    }[]) {
      countByList.set(row.list_id, Number(row.item_count) || 0);
    }

    const lists = listRows.map((l) => ({
      id: l.id as string,
      title: l.title as string,
      description: (l.description as string | null) ?? null,
      type: l.type as "album" | "song",
      visibility:
        (l.visibility as "public" | "friends" | "private") ?? "private",
      emoji: (l.emoji as string | null) ?? null,
      image_url: (l.image_url as string | null) ?? null,
      created_at: l.created_at as string,
      item_count: countByList.get(l.id as string) ?? 0,
    }));

    res.status(200).json({ lists });
  } catch (e) {
    console.error("[users] lists", e);
    res.status(500).json({ error: "Failed to load lists" });
  }
});

/**
 * GET /api/users/:username/followers — same contract as Next.js `app/api/users/[username]/followers`.
 * Must be registered before `GET /:username` (single-segment profile).
 */
usersRouter.get("/:username/followers", async (req, res) => {
  const username = req.params.username;
  if (!username || !isValidUsername(username)) {
    res.status(400).json({ error: "Invalid username format" });
    return;
  }
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (userError || !user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const viewer = await getSession(req);
  const viewerId = viewer?.id ?? null;

  const limit = clampLimit(req.query.limit, 50, 20);
  const offset = Number(req.query.offset) || 0;
  if (offset < 0) {
    res.status(400).json({ error: "offset must be >= 0" });
    return;
  }

  try {
    const result = await getFollowListWithStatus(user.id, viewerId, "followers", {
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (e) {
    console.error("[users] followers list", e);
    res.status(500).json({ error: "Failed to load followers" });
  }
});

usersRouter.get("/:username/following", async (req, res) => {
  const username = req.params.username;
  if (!username || !isValidUsername(username)) {
    res.status(400).json({ error: "Invalid username format" });
    return;
  }
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (userError || !user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const viewer = await getSession(req);
  const viewerId = viewer?.id ?? null;

  const limit = clampLimit(req.query.limit, 50, 20);
  const offset = Number(req.query.offset) || 0;
  if (offset < 0) {
    res.status(400).json({ error: "offset must be >= 0" });
    return;
  }

  try {
    const result = await getFollowListWithStatus(user.id, viewerId, "following", {
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (e) {
    console.error("[users] following list", e);
    res.status(500).json({ error: "Failed to load following" });
  }
});

usersRouter.get("/:username", async (req, res) => {
  const username = req.params.username;
  if (!username || !isValidUsername(username)) {
    res.status(400).json({ error: "Invalid username format" });
    return;
  }
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, avatar_url, bio, created_at")
    .eq("username", username)
    .single();

  if (error || !user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [
    followersRes,
    followingRes,
    reviewsCountRes,
    streakRes,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", user.id),
    supabase
      .from("follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", user.id),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("user_streaks")
      .select("current_streak, longest_streak, last_listen_date")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (followersRes.error || followingRes.error) {
    console.error(
      "[users] followers/following count",
      followersRes.error,
      followingRes.error,
    );
    res.status(500).json({ error: "Failed to load profile" });
    return;
  }

  const viewer = await getSession(req);
  let isFollowing = false;
  if (viewer?.id && viewer.id !== user.id) {
    const { data: follow, error: followError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewer.id)
      .eq("following_id", user.id)
      .maybeSingle();
    if (followError && followError.code !== "PGRST116") {
      console.error("[users] isFollowing", followError);
      res.status(500).json({ error: "Failed to load profile" });
      return;
    }
    isFollowing = !!follow;
  }

  const review_count = reviewsCountRes.count ?? 0;
  const streak =
    streakRes.data && !streakRes.error
      ? {
          current_streak: Number(streakRes.data.current_streak) || 0,
          longest_streak: Number(streakRes.data.longest_streak) || 0,
          last_listen_date: streakRes.data.last_listen_date ?? null,
        }
      : null;

  res.status(200).json({
    ...user,
    followers_count: followersRes.count ?? 0,
    following_count: followingRes.count ?? 0,
    is_following: isFollowing,
    is_own_profile: viewer?.id === user.id,
    review_count,
    streak,
  });
});
