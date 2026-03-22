import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { parseBody, handlePostgrestError } from '@/lib/api-utils';
import { CommentCreateBody } from '@/types';
import { isValidUuid, validateCommentContent } from '@/lib/validation';
import { fetchUserMap } from '@/lib/queries';

function isMissingReviewIdColumn(err: unknown) {
  const anyErr = err as any;
  const code = anyErr?.code;
  const msg = String(anyErr?.message ?? "");
  return code === '42703' && /comments\.?review_id/i.test(msg);
}

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<CommentCreateBody>(request);
    if (parseErr) return parseErr;

    const { review_id, content } = body!;

    if (!review_id) return apiBadRequest('review_id is required');
    if (!isValidUuid(review_id)) return apiBadRequest('Invalid review_id');

    const contentResult = validateCommentContent(content);
    if (!contentResult.ok) return apiBadRequest(contentResult.error);

    const supabase = await createSupabaseServerClient();
    let data: any = null;
    let error: any = null;

    // Preferred schema: comments(review_id).
    ({ data, error } = await supabase
      .from('comments')
      .insert({
        user_id: me!.id,
        review_id,
        content: contentResult.value,
      })
      .select('id, user_id, review_id, content, created_at')
      .single());

    // Fallback schema: comments(log_id) where log_id values may be used as review_id UUIDs.
    if (error && isMissingReviewIdColumn(error)) {
      ({ data, error } = await supabase
        .from('comments')
        .insert({
          user_id: me!.id,
          log_id: review_id,
          content: contentResult.value,
        })
        .select('id, user_id, log_id, content, created_at')
        .single());
      if (error) {
        console.error('Comment create (fallback) error:', error);
        return apiInternalError(error);
      }
      data = { ...data, review_id };
    }

    if (error) {
      return handlePostgrestError(error, {
        '23503': 'Review not found',
      });
    }

    console.log("[comments] comment-created", {
      userId: me!.id,
      commentId: data.id,
      reviewId: data.review_id,
    });

    const { data: author } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .eq('id', me!.id)
      .single();
    return apiOk({ ...data, user: author ?? null });
  },
  { requireAuth: true }
);

export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const reviewId = searchParams.get('review_id');
  if (!reviewId) return apiBadRequest('review_id is required');
  if (!isValidUuid(reviewId)) return apiBadRequest('Invalid review_id');

  const supabase = await createSupabaseServerClient();
  let comments: any[] | null = null;
  let error: any = null;

  // Preferred schema: comments(review_id).
  ({ data: comments, error } = await supabase
    .from('comments')
    .select('id, user_id, review_id, content, created_at')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: true }));

  // Fallback schema: comments(log_id).
  if (error && isMissingReviewIdColumn(error)) {
    ({ data: comments, error } = await supabase
      .from('comments')
      .select('id, user_id, log_id, content, created_at')
      .eq('log_id', reviewId)
      .order('created_at', { ascending: true }));
    if (error) {
      console.error('Comments GET (fallback) error:', error);
      return apiInternalError(error);
    }
    comments = (comments ?? []).map((c: any) => ({ ...c, review_id: reviewId }));
  }

  if (error) {
    console.error('Comments GET error:', error);
    return apiInternalError(error);
  }

  if (!comments?.length) return apiOk([]);

  const userIds = [...new Set(comments.map((c: any) => c.user_id))];
  const userMap = await fetchUserMap(supabase, userIds);

  const result = comments.map((c: any) => ({ ...c, user: userMap.get(c.user_id) ?? null }));
  return apiOk(result);
});
