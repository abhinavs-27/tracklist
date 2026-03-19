import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { parseBody, handlePostgrestError } from '@/lib/api-utils';
import { isValidUuid, validateCommentContent } from '@/lib/validation';
import { fetchUserMap } from '@/lib/queries';

export async function POST(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const { review_id, content } = body!;

    if (!review_id) return apiBadRequest('review_id is required');
    if (!isValidUuid(review_id)) return apiBadRequest('Invalid review_id');

    const contentResult = validateCommentContent(content);
    if (!contentResult.ok) return apiBadRequest(contentResult.error);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('comments')
      .insert({
        user_id: session.user.id,
        review_id,
        content: contentResult.value,
      })
      .select('id, user_id, review_id, content, created_at')
      .single();

    if (error) {
      return handlePostgrestError(error, {
        '23503': 'Review not found',
      });
    }

    console.log("[comments] comment-created", {
      userId: session.user.id,
      commentId: data.id,
      reviewId: data.review_id,
    });

    const { data: user } = await supabase.from('users').select('id, username, avatar_url').eq('id', session.user.id).single();
    return apiOk({ ...data, user: user ?? null });
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reviewId = searchParams.get('review_id');
    if (!reviewId) return apiBadRequest('review_id is required');
    if (!isValidUuid(reviewId)) return apiBadRequest('Invalid review_id');

    const supabase = await createSupabaseServerClient();
    const { data: comments, error } = await supabase
      .from('comments')
      .select('id, user_id, review_id, content, created_at')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Comments GET error:', error);
      return apiInternalError(error);
    }

    if (!comments?.length) return apiOk([]);

    const userIds = [...new Set(comments.map((c) => c.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    const result = comments.map((c) => ({ ...c, user: userMap.get(c.user_id) ?? null }));
    return apiOk(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
