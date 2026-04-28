import { Router } from "express";
import {
  badRequest,
  forbidden,
  internalError,
  noContent,
  notFound,
  ok,
  unauthorized,
} from "../lib/http";
import { getSession, getSessionUserId } from "../lib/auth";
import { getSupabase } from "../lib/supabase";
import {
  clampLimit,
  isValidSpotifyId,
  isValidUuid,
  validateRating,
  validateReviewContent,
} from "../lib/validation";
import { getReviewsForEntity } from "../services/reviewsService";

export const reviewsRouter = Router();

reviewsRouter.get("/", async (req, res) => {
  try {
    const entityType = req.query.entity_type as string | undefined;
    const entityId = req.query.entity_id as string | undefined;
    const limit = clampLimit(req.query.limit, 20, 10);

    if (!entityType || !entityId) {
      return badRequest(res, "entity_type and entity_id required");
    }
    if (entityType !== "album" && entityType !== "song") {
      return badRequest(res, "entity_type must be album or song");
    }
    if (!isValidSpotifyId(entityId)) {
      return badRequest(res, "Invalid entity_id (Spotify ID)");
    }

    const session = await getSession(req);
    const result = await getReviewsForEntity(
      entityType,
      entityId,
      limit,
      session?.id ?? null,
      session?.username ?? null,
    );
    if (!result) return internalError(res, "Failed to fetch reviews");

    return ok(res, result);
  } catch (e) {
    return internalError(res, e);
  }
});

reviewsRouter.post("/", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const body = req.body as Record<string, unknown>;
    const { entity_type, entity_id, rating, review_text } = body;

    if (!entity_type || !entity_id || rating == null) {
      return badRequest(res, "entity_type, entity_id, and rating required");
    }
    if (entity_type !== "album" && entity_type !== "song") {
      return badRequest(res, "entity_type must be album or song");
    }
    if (!isValidSpotifyId(entity_id)) {
      return badRequest(res, "Invalid entity_id (Spotify ID)");
    }
    const ratingResult = validateRating(rating);
    if (!ratingResult.ok) {
      return badRequest(res, ratingResult.error);
    }
    const reviewText = validateReviewContent(review_text);

    const supabase = getSupabase();
    const row = {
      user_id: userId,
      entity_type: entity_type as string,
      entity_id: entity_id as string,
      rating: ratingResult.value,
      review_text: reviewText,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("reviews")
      .upsert(row, {
        onConflict: "user_id,entity_type,entity_id",
      })
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at, user:users(id, username, avatar_url)",
      )
      .single();

    if (error) return internalError(res, error);

    try {
      await supabase.rpc("grant_achievement_on_review", { p_user_id: userId });
    } catch {
      /* optional RPC */
    }

    const userRow = (data as any).user as { id: string, username: string, avatar_url: string | null } | null;

    const reviewWithUser = {
      id: data.id,
      user_id: data.user_id,
      username: userRow?.username ?? null,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      rating: data.rating,
      review_text: data.review_text ?? null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      user: userRow
        ? {
            id: userRow.id,
            username: userRow.username,
            avatar_url: userRow.avatar_url ?? null,
          }
        : null,
    };

    return ok(res, reviewWithUser);
  } catch (e) {
    return internalError(res, e);
  }
});

reviewsRouter.patch("/:id", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const { id } = req.params;
    if (!isValidUuid(id)) return badRequest(res, "Invalid review id");

    const body = req.body as Record<string, unknown>;
    const { rating, review_text } = body;

    const supabase = getSupabase();
    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return notFound(res, "Review not found");
    if (existing.user_id !== userId) return forbidden(res, "Not your review");

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (rating != null) {
      const ratingResult = validateRating(rating);
      if (!ratingResult.ok) {
        return badRequest(res, ratingResult.error);
      }
      updates.rating = ratingResult.value;
    }
    if (review_text !== undefined) {
      updates.review_text = validateReviewContent(review_text);
    }

    const { data, error } = await supabase
      .from("reviews")
      .update(updates)
      .eq("id", id)
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .single();

    if (error) return internalError(res, error);
    return ok(res, data);
  } catch (e) {
    return internalError(res, e);
  }
});

reviewsRouter.delete("/:id", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    const { id } = req.params;
    if (!isValidUuid(id)) return badRequest(res, "Invalid review id");

    const supabase = getSupabase();
    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return notFound(res, "Review not found");
    if (existing.user_id !== userId) return forbidden(res, "Not your review");

    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) return internalError(res, error);
    return noContent(res);
  } catch (e) {
    return internalError(res, e);
  }
});
