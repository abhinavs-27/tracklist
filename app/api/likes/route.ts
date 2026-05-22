import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody, handlePostgrestError, validateUuidParam } from '@/lib/api-utils';
import { LikeCreateBody } from '@/types';

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<LikeCreateBody>(request);
    if (parseErr) return parseErr;

    const reviewId = body!.review_id;
    if (!reviewId) return apiBadRequest('review_id is required');

    const uuidRes = validateUuidParam(reviewId);
    if (!uuidRes.ok) return uuidRes.error;
    const validReviewId = uuidRes.id;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('likes').insert({
      user_id: me!.id,
      review_id: validReviewId,
    });

    if (error) {
      return handlePostgrestError(error, {
        '23505': 'Already liked',
        '23503': 'Review not found',
      });
    }
    console.log("[likes] review-liked", {
      userId: me!.id,
      reviewId: validReviewId,
    });

    // Notify the review owner (skip self-likes)
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
      const { sendPushToUser } = await import("@/lib/push/send");
      const admin = createSupabaseAdminClient();

      // Look up the review to get its owner, entity_type, entity_id
      const { data: review } = await admin
        .from("reviews")
        .select("user_id, entity_type, entity_id")
        .eq("id", validReviewId)
        .maybeSingle();

      const ownerId = (review as { user_id?: string } | null)?.user_id;
      if (ownerId && ownerId !== me!.id) {
        // Insert notification row
        await admin.from("notifications").insert({
          user_id: ownerId,
          actor_user_id: me!.id,
          type: "review_like",
          entity_type: (review as { entity_type?: string } | null)?.entity_type ?? null,
          entity_id: (review as { entity_id?: string } | null)?.entity_id ?? null,
        });

        // Send push
        const entityId = (review as { entity_id?: string } | null)?.entity_id;
        const entityType = (review as { entity_type?: string } | null)?.entity_type;
        await sendPushToUser(admin, ownerId, {
          title: "Someone liked your review",
          body: `@${me!.username ?? "Someone"} liked your review`,
          data: entityType === "album" && entityId
            ? { url: `/album/${entityId}` }
            : { url: "/notifications" },
        });
      }
    } catch (e) {
      console.warn("[likes] notification/push failed", e);
    }

    return apiOk({ success: true });
  },
  { requireAuth: true }
);

export const DELETE = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const reviewId = searchParams.get('review_id');
    if (!reviewId) return apiBadRequest('review_id is required');

    const uuidRes = validateUuidParam(reviewId);
    if (!uuidRes.ok) return uuidRes.error;
    const validReviewId = uuidRes.id;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', me!.id)
      .eq('review_id', validReviewId);

    if (error) {
      console.error('Unlike error:', error);
      return apiInternalError(error);
    }
    console.log("[likes] review-unliked", {
      userId: me!.id,
      reviewId: validReviewId,
    });
    return apiOk({ success: true });
  },
  { requireAuth: true }
);
