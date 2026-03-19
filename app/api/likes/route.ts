import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody, handlePostgrestError } from '@/lib/api-utils';
import { isValidUuid } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const reviewId = body!.review_id as string;
    if (!reviewId) return apiBadRequest('review_id is required');
    if (!isValidUuid(reviewId)) return apiBadRequest('Invalid review_id');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('likes').insert({
      user_id: session.user.id,
      review_id: reviewId,
    });

    if (error) {
      return handlePostgrestError(error, {
        '23505': 'Already liked',
        '23503': 'Review not found',
      });
    }
    console.log("[likes] review-liked", {
      userId: session.user.id,
      reviewId,
    });
    return apiOk({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { searchParams } = new URL(request.url);
    const reviewId = searchParams.get('review_id');
    if (!reviewId) return apiBadRequest('review_id is required');
    if (!isValidUuid(reviewId)) return apiBadRequest('Invalid review_id');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('likes')
      .delete()
      .eq('user_id', session.user.id)
      .eq('review_id', reviewId);

    if (error) {
      console.error('Unlike error:', error);
      return apiInternalError(error);
    }
    console.log("[likes] review-unliked", {
      userId: session.user.id,
      reviewId,
    });
    return apiOk({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
