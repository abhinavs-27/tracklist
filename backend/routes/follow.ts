import { Router } from "express";
import { getSession } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidUuid } from "../lib/validation";

/** POST / DELETE /api/follow — mirrors Next.js `app/api/follow/route.ts`. */
export const followRouter = Router();

followRouter.post("/", async (req, res) => {
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }
  const me = await getSession(req);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const followingId = req.body?.following_id as string | undefined;
  if (!followingId || !isValidUuid(followingId)) {
    res.status(400).json({ error: "following_id is required" });
    return;
  }
  if (followingId === me.id) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("follows").insert({
    follower_id: me.id,
    following_id: followingId,
  });

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "Already following" });
      return;
    }
    if (error.code === "23503") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    console.error("[follow] insert", error);
    res.status(500).json({ error: "Failed to follow" });
    return;
  }

  await supabase.from("notifications").insert({
    user_id: followingId,
    actor_user_id: me.id,
    type: "follow",
  });

  res.status(200).json({ success: true });
});

followRouter.delete("/", async (req, res) => {
  if (!isSupabaseConfigured()) {
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }
  const me = await getSession(req);
  if (!me) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const followingId =
    typeof req.query.following_id === "string" ? req.query.following_id : "";
  if (!followingId || !isValidUuid(followingId)) {
    res.status(400).json({ error: "following_id is required" });
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", me.id)
    .eq("following_id", followingId);

  if (error) {
    console.error("[follow] delete", error);
    res.status(500).json({ error: "Failed to unfollow" });
    return;
  }

  res.status(200).json({ success: true });
});
