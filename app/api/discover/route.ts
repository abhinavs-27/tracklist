import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { clampLimit } from '@/lib/validation';
import type { DiscoverUsersResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get('limit'), 20, 16);

    const supabase = await createSupabaseServerClient();

    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('user_id, entity_id, entity_type, created_at')
      .eq('entity_type', 'album')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit * 10, 50), 80));

    if (reviewsError) return apiInternalError(reviewsError);

    const recentReviews = reviews ?? [];
    const seen = new Set<string>();
    const userIds: string[] = [];
    const latestAlbumByUser = new Map<string, { spotify_id: string; created_at: string }>();

    for (const r of recentReviews) {
      if (!r?.user_id || !r?.entity_id) continue;
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      userIds.push(r.user_id);
      latestAlbumByUser.set(r.user_id, { spotify_id: r.entity_id, created_at: r.created_at });
      if (userIds.length >= limit) break;
    }

    if (userIds.length === 0) {
      const body: DiscoverUsersResponse = { users: [] };
      return apiOk(body);
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, avatar_url, bio, created_at')
      .in('id', userIds);

    if (usersError) return apiInternalError(usersError);

    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id ?? null;

    let followingSet = new Set<string>();
    if (viewerId) {
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', viewerId)
        .in('following_id', userIds);
      if (followsError) return apiInternalError(followsError);
      followingSet = new Set((follows ?? []).map((f) => (f as { following_id: string }).following_id));
    }

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));
    const result = userIds
      .map((id) => {
        const u = userMap.get(id) as
          | { id: string; username: string; avatar_url: string | null; bio: string | null; created_at: string }
          | undefined;
        if (!u) return null;
        const latest = latestAlbumByUser.get(id);
        return {
          id: u.id,
          username: u.username,
          avatar_url: u.avatar_url,
          latest_album_spotify_id: latest?.spotify_id ?? null,
          latest_log_created_at: latest?.created_at ?? null,
          is_following: viewerId ? followingSet.has(u.id) : false,
          is_viewer: viewerId ? viewerId === u.id : false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const body: DiscoverUsersResponse = { users: result };
    return apiOk(body);
  } catch (e) {
    if (e instanceof TypeError) return apiBadRequest('Invalid request');
    return apiInternalError(e);
  }
}
