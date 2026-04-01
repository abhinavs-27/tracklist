import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody, handlePostgrestError, validateUuidParam } from '@/lib/api-utils';
import { FollowCreateBody } from '@/types';

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<FollowCreateBody>(request);
    if (parseErr) return parseErr;

    const followingId = body!.following_id;
    if (!followingId) return apiBadRequest('following_id is required');

    const uuidRes = validateUuidParam(followingId);
    if (!uuidRes.ok) return uuidRes.error;
    const validFollowingId = uuidRes.id;

    if (validFollowingId === me!.id) return apiBadRequest('Cannot follow yourself');

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('follows').insert({
      follower_id: me!.id,
      following_id: validFollowingId,
    });

    if (error) {
      return handlePostgrestError(error, {
        '23505': 'Already following',
        '23503': 'User not found',
      });
    }
    await supabase.from('notifications').insert({
      user_id: validFollowingId,
      actor_user_id: me!.id,
      type: 'follow',
    });
    try {
      const { fanOutFollowInSharedCommunities } = await import(
        '@/lib/community/community-feed-insert'
      );
      await fanOutFollowInSharedCommunities({
        followerId: me!.id,
        followingId: validFollowingId,
      });
    } catch (e) {
      console.warn('[follow] community_feed fan-out', e);
    }
    console.log("[follow] user-followed", {
      followerId: me!.id,
      followingId: validFollowingId,
    });
    return apiOk({ success: true });
  },
  { requireAuth: true }
);

export const DELETE = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const followingId = searchParams.get('following_id');
    if (!followingId) return apiBadRequest('following_id is required');

    const uuidRes = validateUuidParam(followingId);
    if (!uuidRes.ok) return uuidRes.error;
    const validFollowingId = uuidRes.id;

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', me!.id)
      .eq('following_id', validFollowingId);

    if (error) {
      console.error('Unfollow error:', error);
      return apiInternalError(error);
    }
    console.log("[follow] user-unfollowed", {
      followerId: me!.id,
      followingId: validFollowingId,
    });
    return apiOk({ success: true });
  },
  { requireAuth: true }
);
