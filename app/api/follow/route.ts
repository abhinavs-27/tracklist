import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiUnauthorized,
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody } from '@/lib/api-utils';
import { isValidUuid } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const followingId = body!.following_id as string;
    if (!followingId) return apiBadRequest('following_id is required');
    if (!isValidUuid(followingId)) return apiBadRequest('Invalid following_id');
    if (followingId === session.user.id) return apiBadRequest('Cannot follow yourself');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('follows').insert({
      follower_id: session.user.id,
      following_id: followingId,
    });

    if (error) {
      if (error.code === '23505') return apiConflict('Already following');
      if (error.code === '23503') return apiBadRequest('User not found');
      console.error('Follow error:', error);
      return apiInternalError(error);
    }
    await supabase.from('notifications').insert({
      user_id: followingId,
      actor_user_id: session.user.id,
      type: 'follow',
    });
    console.log("[follow] user-followed", {
      followerId: session.user.id,
      followingId,
    });
    return apiOk({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const followingId = searchParams.get('following_id');
    if (!followingId) return apiBadRequest('following_id is required');
    if (!isValidUuid(followingId)) return apiBadRequest('Invalid following_id');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', session.user.id)
      .eq('following_id', followingId);

    if (error) {
      console.error('Unfollow error:', error);
      return apiInternalError(error);
    }
    console.log("[follow] user-unfollowed", {
      followerId: session.user.id,
      followingId,
    });
    return apiOk({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
