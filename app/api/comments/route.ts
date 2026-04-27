import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { parseBody, handlePostgrestError, validateUuidParam } from '@/lib/api-utils';
import { CommentCreateBody } from '@/types';
import { validateCommentContent } from '@/lib/validation';
import { fetchUserSummary, fetchUserSummaryMap } from '@/lib/queries';

function isMissingReviewIdColumn(err: unknown) {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '42703' && /comments\.?review_id/i.test(e?.message ?? "");
}

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<CommentCreateBody>(request);
    if (parseErr) return parseErr;

    const { review_id, content } = body!;

    if (!review_id) return apiBadRequest('review_id is required');
    const uuidRes = validateUuidParam(review_id);
    if (!uuidRes.ok) return uuidRes.error;
    const validReviewId = uuidRes.id;

    const contentResult = validateCommentContent(content);
    if (!contentResult.ok) return apiBadRequest(contentResult.error);

    const supabase = await createSupabaseServerClient();
    let data: Record<string, unknown> | null = null;
    let error: unknown = null;

    // Preferred schema: comments(review_id).
    const prefRes = await supabase
      .from('comments')
      .insert({
        user_id: me!.id,
        review_id: validReviewId,
        content: contentResult.value,
      })
      .select('id, content, created_at')
      .single();
    data = prefRes.data as Record<string, unknown> | null;
    error = prefRes.error;

    // Fallback schema: comments(log_id) where log_id values may be used as review_id UUIDs.
    if (error && isMissingReviewIdColumn(error)) {
      const fallRes = await supabase
        .from('comments')
        .insert({
          user_id: me!.id,
          log_id: validReviewId,
          content: contentResult.value,
        })
        .select('id, content, created_at')
        .single();
      data = fallRes.data as Record<string, unknown> | null;
      error = fallRes.error;
      if (error) {
        console.error('Comment create (fallback) error:', error);
        return apiInternalError(error as { message: string });
      }
    }

    if (data) {
      data = { ...data, user_id: me!.id, review_id: validReviewId };
    }

    if (error) {
      return handlePostgrestError(error as { code: string; message: string }, {
        '23503': 'Review not found',
      });
    }

    if (!data) return apiInternalError('Failed to create comment');

    console.log("[comments] comment-created", {
      userId: me!.id,
      commentId: data.id,
      reviewId: data.review_id,
    });

    const author = await fetchUserSummary(me!.id);
    return apiOk({ ...data, user: author });
  },
  { requireAuth: true }
);

export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const reviewId = searchParams.get('review_id');
  if (!reviewId) return apiBadRequest('review_id is required');
  const uuidRes = validateUuidParam(reviewId);
  if (!uuidRes.ok) return uuidRes.error;
  const validReviewId = uuidRes.id;

  const supabase = await createSupabaseServerClient();
  let comments: Record<string, unknown>[] | null = null;
  let error: unknown = null;

  // Preferred schema: comments(review_id).
  const prefGetRes = await supabase
    .from('comments')
    .select('id, user_id, content, created_at, users(id, username, avatar_url)')
    .eq('review_id', validReviewId)
    .order('created_at', { ascending: true });
  comments = (prefGetRes.data as any[] | null)?.map(c => ({
    ...c,
    review_id: validReviewId,
    user: c.users ? {
      id: c.users.id,
      username: c.users.username,
      avatar_url: c.users.avatar_url ?? null,
    } : null,
    users: undefined,
  })) ?? null;
  error = prefGetRes.error;

  // Fallback schema: comments(log_id).
  if (error && isMissingReviewIdColumn(error)) {
    const fallGetRes = await supabase
      .from('comments')
      .select('id, user_id, content, created_at, users(id, username, avatar_url)')
      .eq('log_id', validReviewId)
      .order('created_at', { ascending: true });
    comments = (fallGetRes.data as any[] | null)?.map(c => ({
      ...c,
      review_id: validReviewId,
      user: c.users ? {
        id: c.users.id,
        username: c.users.username,
        avatar_url: c.users.avatar_url ?? null,
      } : null,
      users: undefined,
    })) ?? null;
    error = fallGetRes.error;
    if (error) {
      console.error('Comments GET (fallback) error:', error);
      return apiInternalError(error as { message: string });
    }
  }

  if (error) {
    console.error('Comments GET error:', error);
    return apiInternalError(error as { message: string });
  }

  if (!comments?.length) return apiOk([]);

  return apiOk(comments);
});
