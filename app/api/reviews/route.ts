import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidSpotifyId } from "@/lib/validation";
import { validateReviewContent } from "@/lib/validation";
import { clampLimit } from "@/lib/validation";
import { getReviewsForEntity } from "@/lib/queries";

/** GET ?entity_type=album|song&entity_id=<spotify_id>&limit= optional */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");
    const limit = clampLimit(searchParams.get("limit"), 20, 10);

    if (!entityType || !entityId) {
      return apiBadRequest("entity_type and entity_id required");
    }
    if (entityType !== "album" && entityType !== "song") {
      return apiBadRequest("entity_type must be album or song");
    }
    if (!isValidSpotifyId(entityId)) {
      return apiBadRequest("Invalid entity_id (Spotify ID)");
    }

    const result = await getReviewsForEntity(entityType, entityId, limit);
    if (!result) return apiInternalError("Failed to fetch reviews");

    return apiOk(result);
  } catch (e) {
    return apiInternalError(e);
  }
}

/** POST – create or upsert review (one per user per entity) */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const { entity_type, entity_id, rating, review_text } = body!;

    if (!entity_type || !entity_id || rating == null) {
      return apiBadRequest("entity_type, entity_id, and rating required");
    }
    if (entity_type !== "album" && entity_type !== "song") {
      return apiBadRequest("entity_type must be album or song");
    }
    if (!isValidSpotifyId(entity_id)) {
      return apiBadRequest("Invalid entity_id (Spotify ID)");
    }
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return apiBadRequest("rating must be an integer 1–5");
    }
    const reviewText = validateReviewContent(review_text);

    const supabase = await createSupabaseServerClient();
    const row = {
      user_id: session.user.id,
      entity_type: entity_type as string,
      entity_id: entity_id as string,
      rating: r,
      review_text: reviewText,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("reviews")
      .upsert(row, {
        onConflict: "user_id,entity_type,entity_id",
      })
      .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error);
    const { grantAchievementOnReview } = await import("@/lib/queries");
    await grantAchievementOnReview(session.user.id);

    const { data: userRow } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .eq("id", session.user.id)
      .single();

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
        ? { id: userRow.id, username: userRow.username, avatar_url: userRow.avatar_url ?? null }
        : null,
    };

    console.log("[reviews] review-created-upserted", {
      userId: session.user.id,
      reviewId: data.id,
      entityType: data.entity_type,
      entityId: data.entity_id,
    });
    return apiOk(reviewWithUser);
  } catch (e) {
    return apiInternalError(e);
  }
}
