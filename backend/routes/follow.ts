import { Router } from "express";
import { getSession } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidUuid } from "../lib/validation";
import {
  badRequest,
  conflict,
  internalError,
  notFound,
  ok,
  unauthorized,
} from "../lib/http";

/** POST / DELETE /api/follow — mirrors Next.js `app/api/follow/route.ts`. */
export const followRouter = Router();

followRouter.post("/", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
  }
  const me = await getSession(req);
  if (!me) {
    return unauthorized(res);
  }

  const followingId = req.body?.following_id as string | undefined;
  if (!followingId || !isValidUuid(followingId)) {
    return badRequest(res, "following_id is required");
  }
  if (followingId === me.id) {
    return badRequest(res, "Cannot follow yourself");
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("follows").insert({
    follower_id: me.id,
    following_id: followingId,
  });

  if (error) {
    if (error.code === "23505") {
      return conflict(res, "Already following");
    }
    if (error.code === "23503") {
      return notFound(res, "User not found");
    }
    console.error("[follow] insert", error);
    return internalError(res, "Failed to follow");
  }

  await supabase.from("notifications").insert({
    user_id: followingId,
    actor_user_id: me.id,
    type: "follow",
  });

  return ok(res, { success: true });
});

followRouter.delete("/", async (req, res) => {
  if (!isSupabaseConfigured()) {
    return internalError(res, "Server misconfigured");
  }
  const me = await getSession(req);
  if (!me) {
    return unauthorized(res);
  }

  const followingId =
    typeof req.query.following_id === "string" ? req.query.following_id : "";
  if (!followingId || !isValidUuid(followingId)) {
    return badRequest(res, "following_id is required");
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", me.id)
    .eq("following_id", followingId);

  if (error) {
    console.error("[follow] delete", error);
    return internalError(res, "Failed to unfollow");
  }

  return ok(res, { success: true });
});
