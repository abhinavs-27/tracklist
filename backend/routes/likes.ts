import { Router } from "express";
import {
  badRequest,
  conflict,
  internalError,
  ok,
  unauthorized,
} from "../lib/http";
import { getSessionUserId } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { isValidUuid } from "../../lib/validation";

export const likesRouter = Router();

likesRouter.post("/", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const body = req.body as Record<string, unknown>;
    const reviewId = body.review_id as string | undefined;
    if (!reviewId) return badRequest(res, "review_id is required");
    if (!isValidUuid(reviewId)) return badRequest(res, "Invalid review_id");

    const supabase = getSupabase();
    const { error } = await supabase.from("likes").insert({
      user_id: userId,
      review_id: reviewId,
    });

    if (error) {
      const e = error as { code?: string };
      if (e.code === "23505") return conflict(res, "Already liked");
      if (e.code === "23503") return badRequest(res, "Review not found");
      return internalError(res, error);
    }
    return ok(res, { success: true });
  } catch (e) {
    return internalError(res, e);
  }
});

likesRouter.delete("/", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const reviewId = req.query.review_id as string | undefined;
    if (!reviewId) return badRequest(res, "review_id is required");
    if (!isValidUuid(reviewId)) return badRequest(res, "Invalid review_id");

    const supabase = getSupabase();
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("user_id", userId)
      .eq("review_id", reviewId);

    if (error) return internalError(res, error);
    return ok(res, { success: true });
  } catch (e) {
    return internalError(res, e);
  }
});
