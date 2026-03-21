import { NextRequest } from 'next/server';
import { handleUnauthorized, requireApiAuth } from '@/lib/auth';
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
    const me = await requireApiAuth(request);

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const followingId = body!.following_id as string;
    if (!followingId) return apiBadRequest('following_id is required');
    if (!isValidUuid(followingId)) return apiBadRequest('Invalid following_id');
    if (followingId === me.id) return apiBadRequest('Cannot follow yourself');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('follows').insert({
      follower_id: me.id,
      following_id: followingId,
    });

    if (error) {
      return handlePostgrestError(error, {
        '23505': 'Already following',
        '23503': 'User not found',
      });
    }
    await supabase.from('notifications').insert({
      user_id: followingId,
      actor_user_id: me.id,
      type: 'follow',
    });
    console.log("[follow] user-followed", {
      followerId: me.id,
      followingId,
    });
    return apiOk({ success: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { searchParams } = new URL(request.url);
    const followingId = searchParams.get('following_id');
    if (!followingId) return apiBadRequest('following_id is required');
    if (!isValidUuid(followingId)) return apiBadRequest('Invalid following_id');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', me.id)
      .eq('following_id', followingId);

    if (error) {
      console.error('Unfollow error:', error);
      return apiInternalError(error);
    }
    console.log("[follow] user-unfollowed", {
      followerId: me.id,
      followingId,
    });
    return apiOk({ success: true });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
