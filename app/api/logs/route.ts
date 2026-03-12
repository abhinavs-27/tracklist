import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase';
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from '@/lib/api-response';
import {
  isValidUuid,
  isValidSpotifyId,
  validateLogTitle,
  validateReviewContent,
  clampLimit,
  LIMITS,
} from '@/lib/validation';

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
    const { spotify_id, listened_at } = b;

    if (!spotify_id) {
      return apiBadRequest('Missing required field: spotify_id');
    }
    if (!isValidSpotifyId(spotify_id)) {
      return apiBadRequest('Invalid spotify_id format');
    }
    let listenedAt: string;
    try {
      listenedAt = listened_at
        ? new Date(listened_at as string | number).toISOString()
        : new Date().toISOString();
      if (Number.isNaN(Date.parse(listenedAt))) throw new Error('Invalid date');
    } catch {
      return apiBadRequest('Invalid listened_at date');
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('logs')
      .insert({
        user_id: session.user.id,
        spotify_song_id: spotify_id,
        played_at: listenedAt,
      })
      .select()
      .single();

    if (error) {
      console.error('Log create error:', error);
      return apiInternalError(error);
    }
    console.log(
      '[logs] Passive log added: user=%s, song=%s',
      session.user.id,
      spotify_id,
    );
    return NextResponse.json(data);
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const spotifyId = searchParams.get('spotify_id');
    const limit = clampLimit(searchParams.get('limit'), LIMITS.LOGS_LIMIT, 20);

    if (userId && !isValidUuid(userId)) {
      return apiBadRequest('Invalid user_id');
    }
    if (spotifyId && !isValidSpotifyId(spotifyId)) {
      return apiBadRequest('Invalid spotify_id');
    }

    const supabase = createSupabaseServerClient();

    let query = supabase
      .from('logs')
      .select('id, user_id, spotify_song_id, played_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) query = query.eq('user_id', userId);
    if (spotifyId) query = query.eq('spotify_song_id', spotifyId);

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error('Logs GET error:', logsError);
      return apiInternalError(logsError);
    }

    if (!logs?.length) return NextResponse.json([]);

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', userIds);

    if (usersError) {
      console.error('Logs GET users error:', usersError);
      return apiInternalError(usersError);
    }

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const logIds = logs.map((l) => l.id);
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from('likes').select('log_id').in('log_id', logIds),
      supabase.from('comments').select('log_id').in('log_id', logIds),
    ]);

    if (likesRes.error || commentsRes.error) {
      console.error('Logs GET like/comment error:', likesRes.error, commentsRes.error);
      return apiInternalError(likesRes.error ?? commentsRes.error);
    }

    const likeData = likesRes.data;
    const commentData = commentsRes.data;

    const likeCountMap = new Map<string, number>();
    (likeData ?? []).forEach((l) => {
      likeCountMap.set(l.log_id, (likeCountMap.get(l.log_id) ?? 0) + 1);
    });
    const commentCountMap = new Map<string, number>();
    (commentData ?? []).forEach((c) => {
      commentCountMap.set(c.log_id, (commentCountMap.get(c.log_id) ?? 0) + 1);
    });

    const session = await getServerSession(authOptions);
    let likedSet = new Set<string>();
    if (session?.user?.id) {
      const { data: userLikes, error: userLikesError } = await supabase
        .from('likes')
        .select('log_id')
        .eq('user_id', session.user.id)
        .in('log_id', logIds);

      if (userLikesError) {
        console.error('Logs GET userLikes error:', userLikesError);
        return apiInternalError(userLikesError);
      }

      likedSet = new Set((userLikes ?? []).map((l) => l.log_id));
    }

    const result = logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      spotify_id: log.spotify_song_id,
      type: 'song',
      title: null,
      rating: null,
      review: null,
      listened_at: log.played_at,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
      like_count: likeCountMap.get(log.id) ?? 0,
      comment_count: commentCountMap.get(log.id) ?? 0,
      liked: likedSet.has(log.id),
    }));

    return NextResponse.json(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
