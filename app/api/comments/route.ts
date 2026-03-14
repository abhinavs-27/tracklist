import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiUnauthorized, apiBadRequest, apiInternalError } from '@/lib/api-response';
import { isValidUuid, validateCommentContent } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest('Invalid JSON body');
    }
    const b = body as Record<string, unknown>;
    const { review_id, content } = b;

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
      .select("id, user_id, review_id, content, created_at")
      .single();

    if (error) {
      if (error.code === '23503') return apiBadRequest('Review not found');
      console.error('Comment create error:', error);
      return apiInternalError(error);
    }

    console.log("[comments] comment created", {
      userId: session.user.id,
      commentId: data.id,
      reviewId: data.review_id,
    });

    const { data: user } = await supabase.from('users').select('id, username, avatar_url').eq('id', session.user.id).single();
    return NextResponse.json({ ...data, user: user ?? null });
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

    if (!comments?.length) return NextResponse.json([]);

    const userIds = [...new Set(comments.map((c) => c.user_id))];
    const { data: users } = await supabase.from('users').select('id, username, avatar_url').in('id', userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const result = comments.map((c) => ({ ...c, user: userMap.get(c.user_id) ?? null }));
    return NextResponse.json(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
