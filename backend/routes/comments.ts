import { Router } from "express";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { getSessionUserId } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { isValidUuid, validateCommentContent } from "../lib/validation";
import { createComment, getCommentsForReview } from "@/lib/queries";

export const commentsRouter = Router();

commentsRouter.post("/", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const body = req.body as Record<string, unknown>;
    const { review_id, content } = body;

    if (!review_id) return badRequest(res, "review_id is required");
    if (!isValidUuid(review_id)) return badRequest(res, "Invalid review_id");

    const contentResult = validateCommentContent(content);
    if (!contentResult.ok) return badRequest(res, contentResult.error);

    const supabase = getSupabase();
    const { data: comment, error } = await createComment(userId, review_id, contentResult.value, supabase);

    if (error) {
      if (error.code === "23503") return badRequest(res, "Review not found");
      return internalError(res, error);
    }
    if (!comment) return internalError(res, "Failed to create comment");

    return ok(res, comment);
  } catch (e) {
    return internalError(res, e);
  }
});

commentsRouter.get("/", async (req, res) => {
  try {
    const reviewId = req.query.review_id as string | undefined;
    if (!reviewId) return badRequest(res, "review_id is required");
    if (!isValidUuid(reviewId)) return badRequest(res, "Invalid review_id");

    const supabase = getSupabase();
    const comments = await getCommentsForReview(reviewId, supabase);
    return ok(res, comments);
  } catch (e) {
    return internalError(res, e);
  }
});
