import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
  apiServiceUnavailable,
} from "@/lib/api-response";
import { parseBody, getPaginationParams } from "@/lib/api-utils";
import { ReviewCreateBody } from "@/types";
import {
  isValidReviewEntityId,
  isValidUuid,
  isValidSpotifyId,
  normalizeReviewEntityId,
  validateReviewContent,
  validateEntityType,
  validateRating,
} from "@/lib/validation";
import { getReviewsForEntity, fetchUserSummary } from "@/lib/queries";
import { getOrCreateEntity } from "@/lib/catalog/getOrCreateEntity";
import { resolveReviewEntityId } from "@/lib/reviews/resolve-review-entity-id";
import {
  resolveCanonicalAlbumUuidFromEntityId,
  resolveCanonicalTrackUuidFromEntityId,
} from "@/lib/catalog/entity-resolution";

/** GET ?entity_type=album|song&entity_id=<spotify_or_lfm_id>&limit= optional */
export const GET = withHandler(async (request: NextRequest, { user }) => {
  const { searchParams } = request.nextUrl;
  const entityType = searchParams.get("entity_type");
  const rawEntityId = searchParams.get("entity_id");
  const entityId = rawEntityId ? normalizeReviewEntityId(rawEntityId) : null;
  const { limit } = getPaginationParams(searchParams, 10, 20);

  if (!entityType || !entityId) {
    return apiBadRequest("entity_type and entity_id required");
  }

  const typeResult = validateEntityType(entityType);
  if (!typeResult.ok) return apiBadRequest(typeResult.error);

  if (!isValidReviewEntityId(entityId)) {
    return apiBadRequest("Invalid entity_id");
  }

  const result = await getReviewsForEntity(typeResult.value, entityId, limit, user?.id ?? null);
  if (!result) return apiInternalError("Failed to fetch reviews");

  return apiOk(result);
});

/** POST – create or upsert review (one per user per entity) */
export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<ReviewCreateBody>(request);
    if (parseErr) return parseErr;

    const { entity_type, entity_id: rawEntityIdBody, rating, review_text } = body!;

    if (!entity_type || !rawEntityIdBody || rating == null) {
      return apiBadRequest("entity_type, entity_id, and rating required");
    }

    const typeResult = validateEntityType(entity_type);
    if (!typeResult.ok) return apiBadRequest(typeResult.error);

    let entity_id = normalizeReviewEntityId(String(rawEntityIdBody));
    if (!isValidReviewEntityId(entity_id)) {
      return apiBadRequest("Invalid entity_id");
    }

    const supabase = await createSupabaseServerClient();

    // reviews.entity_id is a canonical UUID. Resolve Spotify IDs to it OFFLINE first —
    // if the user can view the entity to rate it, it's already in our catalog and needs
    // no Spotify network. Only a genuinely-absent entity falls back to the network, and
    // if that also fails we return a retriable 503 rather than hard-failing the rating.
    const resolution = await resolveReviewEntityId(entity_id, {
      isUuid: isValidUuid,
      isSpotifyId: isValidSpotifyId,
      resolveOffline: (spotifyId) =>
        typeResult.value === "album"
          ? resolveCanonicalAlbumUuidFromEntityId(supabase, spotifyId)
          : resolveCanonicalTrackUuidFromEntityId(supabase, spotifyId),
      resolveWithNetwork: async (spotifyId) => {
        const resolved = await getOrCreateEntity({
          type: typeResult.value === "album" ? "album" : "track",
          spotifyId,
          allowNetwork: true,
        });
        return resolved.id;
      },
    });
    if (resolution.kind === "pending") {
      return apiServiceUnavailable(
        "This is still syncing from the catalog. Try again in a moment.",
        { code: "entity_pending" },
      );
    }
    entity_id = resolution.id;

    const ratingResult = validateRating(rating);
    if (!ratingResult.ok) return apiBadRequest(ratingResult.error);

    const reviewText = validateReviewContent(review_text);
    const row = {
      user_id: me!.id,
      entity_type: typeResult.value,
      entity_id,
      rating: ratingResult.value,
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

    // Parallelize all post-write side effects.
    const [userRow] = await Promise.all([
      fetchUserSummary(me!.id),
      import("@/lib/queries")
        .then((m) => {
          if (m?.grantAchievementOnReview) {
            return m.grantAchievementOnReview(me!.id).catch(e => console.warn("[reviews] achievement error", e));
          }
        })
        .catch(e => console.warn("[reviews] queries import error", e)),
      import("@/lib/feed/generate-events")
        .then((m) => {
          if (m?.recordRatingFeedEvent) {
            return m.recordRatingFeedEvent(me!.id, {
              review_id: data.id,
              entity_type: data.entity_type,
              entity_id: data.entity_id,
              rating: data.rating,
            }).catch(e => console.warn("[reviews] feed event error", e));
          }
        })
        .catch(e => console.warn("[reviews] feed events import error", e)),
      import("@/lib/community/community-feed-insert")
        .then((m) => {
          if (m?.fanOutReviewForUserCommunities) {
            return m.fanOutReviewForUserCommunities({
              userId: me!.id,
              reviewId: data.id,
              entityType: data.entity_type,
              entityId: data.entity_id,
              rating: data.rating,
              reviewText: data.review_text ?? null,
              createdAt: data.created_at,
            }).catch(e => console.warn("[reviews] community_feed fan-out error", e));
          }
        })
        .catch((e) => {
          console.warn("[reviews] community-feed-insert import error", e);
        }),
    ]);

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
      user: userRow,
    };

    console.log("[reviews] review-created-upserted", {
      userId: me!.id,
      reviewId: data.id,
      entityType: data.entity_type,
      entityId: data.entity_id,
    });
    return apiOk(reviewWithUser);
  },
  { requireAuth: true }
);
