import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody, handlePostgrestError } from '@/lib/api-utils';
import { LikeCreateBody } from '@/types';
import { isValidUuid } from '@/lib/validation';

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<LikeCreateBody>(request);
    if (parseErr) return parseErr;

    const reviewId = body!.review_id;
    if (!reviewId) return apiBadRequest('review_id is required');
    if (!isValidUuid(reviewId)) return apiBadRequest('Invalid review_id');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('likes').insert({
      user_id: me!.id,
      review_id: reviewId,
    });

    if (error) {
      return handlePostgrestError(error, {
        '23505': 'Already liked',
        '23503': 'Review not found',
      });
    }
    console.log("[likes] review-liked", {
      userId: me!.id,
      reviewId,
    });
    return apiOk({ success: true });
  },
  { requireAuth: true }
);

export const DELETE = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const reviewId = searchParams.get('review_id');
    if (!reviewId) return apiBadRequest('review_id is required');
    if (!isValidUuid(reviewId)) return apiBadRequest('Invalid review_id');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', me!.id)
      .eq('review_id', reviewId);

    if (error) {
      console.error('Unlike error:', error);
      return apiInternalError(error);
    }
    console.log("[likes] review-unliked", {
      userId: me!.id,
      reviewId,
    });
    return apiOk({ success: true });
  },
  { requireAuth: true }
);
