import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiInternalError,
  apiOk,
  apiNoContent,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  isValidUuid,
  validateRating,
  validateReviewContent,
} from "@/lib/validation";

/** PATCH – update own review */
export const PATCH = withHandler<{ id: string }>(
  async (request: NextRequest, { params, user: me }) => {
    const { id } = params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid review id");

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const { rating, review_text } = body!;

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return apiNotFound("Review not found");
    if (existing.user_id !== me!.id) return apiForbidden("Not your review");

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (rating != null) {
      const ratingResult = validateRating(rating);
      if (!ratingResult.ok) return apiBadRequest(ratingResult.error);
      updates.rating = ratingResult.value;
    }
    if (review_text !== undefined) {
      updates.review_text = validateReviewContent(review_text);
    }

    const { data, error } = await supabase
      .from("reviews")
      .update(updates)
      .eq("id", id)
      .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error);
    console.log("[reviews] review-updated", {
      userId: me!.id,
      reviewId: data.id,
    });
    return apiOk(data);
  },
  { requireAuth: true }
);

/** DELETE – delete own review */
export const DELETE = withHandler<{ id: string }>(
  async (request: NextRequest, { params, user: me }) => {
    const { id } = params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid review id");

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return apiNotFound("Review not found");
    if (existing.user_id !== me!.id) return apiForbidden("Not your review");

    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) return apiInternalError(error);
    console.log("[reviews] review-deleted", {
      userId: me!.id,
      reviewId: id,
    });
    return apiNoContent();
  },
  { requireAuth: true }
);
