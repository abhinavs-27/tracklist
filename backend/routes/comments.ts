import { Router } from "express";
import { badRequest, internalError, ok, unauthorized } from "../lib/http";
import { getSessionUserId } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import { isValidUuid, validateCommentContent } from "../lib/validation";

export const commentsRouter = Router();

function isMissingReviewIdColumn(err: unknown) {
  const anyErr = err as { code?: string; message?: string };
  const code = anyErr?.code;
  const msg = String(anyErr?.message ?? "");
  return code === "42703" && /comments\.?review_id/i.test(msg);
}

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
    let data: Record<string, unknown> | null = null;
    let error: unknown = null;

    ({ data, error } = await supabase
      .from("comments")
      .insert({
        user_id: userId,
        review_id,
        content: contentResult.value,
      })
      .select("id, user_id, review_id, content, created_at, user:users(id, username, avatar_url)")
      .single());

    if (error && isMissingReviewIdColumn(error)) {
      ({ data, error } = await supabase
        .from("comments")
        .insert({
          user_id: userId,
          log_id: review_id,
          content: contentResult.value,
        })
        .select("id, user_id, log_id, content, created_at, user:users(id, username, avatar_url)")
        .single());
      if (error) return internalError(res, error);
      data = { ...data!, review_id };
    }

    if (error) {
      const e = error as { code?: string };
      if (e.code === "23503") return badRequest(res, "Review not found");
      return internalError(res, error);
    }

    return ok(res, data);
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
    let comments: Record<string, unknown>[] | null = null;
    let error: unknown = null;

    ({ data: comments, error } = await supabase
      .from("comments")
      .select("id, user_id, review_id, content, created_at, user:users(id, username, avatar_url)")
      .eq("review_id", reviewId)
      .order("created_at", { ascending: true }));

    if (error && isMissingReviewIdColumn(error)) {
      ({ data: comments, error } = await supabase
        .from("comments")
        .select("id, user_id, log_id, content, created_at, user:users(id, username, avatar_url)")
        .eq("log_id", reviewId)
        .order("created_at", { ascending: true }));
      if (error) return internalError(res, error);
      comments = (comments ?? []).map((c) => ({ ...c, review_id: reviewId }));
    }

    if (error) return internalError(res, error);

    if (!comments?.length) return ok(res, []);

    return ok(res, comments);
  } catch (e) {
    return internalError(res, e);
  }
});
