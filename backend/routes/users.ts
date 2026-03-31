import { Router } from "express";
import { getSession } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { getFavoriteAlbumsForUser } from "../services/favoriteAlbumsService";
import { getFollowListWithStatus } from "../services/followNetworkService";
import { clampLimit, isValidUsername, isValidUuid } from "../lib/validation";
import { badRequest, internalError, notFound, ok } from "../lib/http";

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
    return badRequest(res, "Invalid user id");
  }
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
  }
  try {
    const items = await getFavoriteAlbumsForUser(userId);
    return ok(res, items);
  } catch (e) {
    return internalError(res, e);
  }
});

usersRouter.get("/:userId/lists", async (req, res) => {
  const userId = req.params.userId;
  if (!isValidUuid(userId)) {
    return badRequest(res, "Invalid user id");
  }
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
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
      return internalError(res, listError);
    }
    if (!listRows?.length) {
      return ok(res, { lists: [] });
    }

    const listIds = listRows.map((l) => l.id as string);
    const { data: countData, error: countError } = await supabase.rpc("get_list_item_counts", {
      p_list_ids: listIds,
    });

    const countByList = new Map<string, number>();
    if (countError) {
      // Fallback when RPC is missing/unavailable in an environment.
      const { data: itemRows, error: itemRowsError } = await supabase
        .from("list_items")
        .select("list_id")
        .in("list_id", listIds);

      if (itemRowsError) {
        console.error("[users] lists item count fallback", itemRowsError);
      } else {
        for (const row of (itemRows ?? []) as { list_id: string }[]) {
          const key = row.list_id;
          countByList.set(key, (countByList.get(key) ?? 0) + 1);
        }
      }
    } else {
      for (const row of (countData ?? []) as {
        list_id: string;
        item_count: number;
      }[]) {
        countByList.set(row.list_id, Number(row.item_count) || 0);
      }
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

    return ok(res, { lists });
  } catch (e) {
    return internalError(res, e);
  }
});

/**
 * GET /api/users/:username/followers — same contract as Next.js `app/api/users/[username]/followers`.
 * Must be registered before `GET /:username` (single-segment profile).
 */
usersRouter.get("/:username/followers", async (req, res) => {
  const username = req.params.username;
  if (!username || !isValidUsername(username)) {
    return badRequest(res, "Invalid username format");
  }
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
  }

  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (userError || !user) {
    return notFound(res, "User not found");
  }

  const viewer = await getSession(req);
  const viewerId = viewer?.id ?? null;

  const limit = clampLimit(req.query.limit, 50, 20);
  const offset = Number(req.query.offset) || 0;
  if (offset < 0) {
    return badRequest(res, "offset must be >= 0");
  }

  try {
    const result = await getFollowListWithStatus(user.id, viewerId, "followers", {
      limit,
      offset,
    });
    return ok(res, result);
  } catch (e) {
    return internalError(res, e);
  }
});

usersRouter.get("/:username/following", async (req, res) => {
  const username = req.params.username;
  if (!username || !isValidUsername(username)) {
    return badRequest(res, "Invalid username format");
  }
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
  }

  const supabase = getSupabase();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (userError || !user) {
    return notFound(res, "User not found");
  }

  const viewer = await getSession(req);
  const viewerId = viewer?.id ?? null;

  const limit = clampLimit(req.query.limit, 50, 20);
  const offset = Number(req.query.offset) || 0;
  if (offset < 0) {
    return badRequest(res, "offset must be >= 0");
  }

  try {
    const result = await getFollowListWithStatus(user.id, viewerId, "following", {
      limit,
      offset,
    });
    return ok(res, result);
  } catch (e) {
    return internalError(res, e);
  }
});

usersRouter.get("/:username", async (req, res) => {
  const username = req.params.username;
  if (!username || !isValidUsername(username)) {
    return badRequest(res, "Invalid username format");
  }
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, avatar_url, bio, created_at")
    .eq("username", username)
    .single();

  if (error || !user) {
    return notFound(res, "User not found");
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
    return internalError(res, followersRes.error || followingRes.error);
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
      return internalError(res, followError);
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

  return ok(res, {
    ...user,
    followers_count: followersRes.count ?? 0,
    following_count: followingRes.count ?? 0,
    is_following: isFollowing,
    is_own_profile: viewer?.id === user.id,
    review_count,
    streak,
  });
});
