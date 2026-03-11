import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError } from '@/lib/api-response';
import { clampLimit, LIMITS } from '@/lib/validation';
import type { DiscoverUsersResponse } from '@/types';

type RecentLogRow = { user_id: string; spotify_id: string; created_at: string };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get('limit'), 20, 16);

    const supabase = createSupabaseServerClient();

    // Pull recent album logs, then dedupe by user to get "most recently active users".
    const { data: logs, error: logsError } = await supabase
      .from('logs')
      .select('user_id, spotify_id, created_at')
      .eq('type', 'album')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit * 15, 50), LIMITS.LOGS_LIMIT));

    if (logsError) return apiInternalError(logsError);

    const recentLogs = (logs ?? []) as RecentLogRow[];
    const seen = new Set<string>();
    const userIds: string[] = [];
    const latestAlbumByUser = new Map<string, { spotify_id: string; created_at: string }>();

    for (const l of recentLogs) {
      if (!l?.user_id || !l?.spotify_id) continue;
      if (seen.has(l.user_id)) continue;
      seen.add(l.user_id);
      userIds.push(l.user_id);
      latestAlbumByUser.set(l.user_id, { spotify_id: l.spotify_id, created_at: l.created_at });
      if (userIds.length >= limit) break;
    }

    if (userIds.length === 0) {
      const body: DiscoverUsersResponse = { users: [] };
      return NextResponse.json(body);
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
    return NextResponse.json(body);
  } catch (e) {
    // In case query params are malformed, treat as bad request.
    if (e instanceof TypeError) return apiBadRequest('Invalid request');
    return apiInternalError(e);
  }
}

