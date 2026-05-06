import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { parseBody, validateUuidParam, handlePostgrestError } from '@/lib/api-utils';
import { CommentCreateBody } from '@/types';
import { validateCommentContent } from '@/lib/validation';
import { createComment, getCommentsForReview } from '@/lib/queries';

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
    const { data: comment, error } = await createComment(me!.id, validReviewId, contentResult.value, supabase);

    if (error) {
      return handlePostgrestError(error, {
        '23503': 'Review not found',
      });
    }

    if (!comment) return apiInternalError('Failed to create comment');

    console.log("[comments] comment-created", {
      userId: me!.id,
      commentId: comment.id,
      reviewId: validReviewId,
    });

    return apiOk(comment);
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
  const result = await getCommentsForReview(validReviewId, supabase);
  return apiOk(result);
});
