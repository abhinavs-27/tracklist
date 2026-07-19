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
      const { notify } = await import("@/lib/notifications/notify");
      const admin = createSupabaseAdminClient();
      const { data: review } = await admin
        .from("reviews")
        .select("user_id, entity_type, entity_id")
        .eq("id", validReviewId)
        .maybeSingle();
      const r = review as
        | { user_id?: string; entity_type?: string; entity_id?: string }
        | null;
      if (r?.user_id) {
        await notify({
          admin,
          userId: r.user_id,
          actorUserId: me!.id,
          type: "review_like",
          entityType: r.entity_type ?? undefined,
          entityId: r.entity_id ?? undefined,
          push: {
            title: "Someone liked your review",
            body: `@${me!.username ?? "Someone"} liked your review`,
            data:
              r.entity_type === "album" && r.entity_id
                ? { url: `/album/${r.entity_id}` }
                : { url: "/notifications" },
          },
        });
      }
    } catch (e) {
      console.warn("[likes] notify failed", e);
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
