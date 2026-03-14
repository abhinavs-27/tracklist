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
      .order('played_at', { ascending: false })
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

    const result = logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      spotify_song_id: log.spotify_song_id,
      played_at: log.played_at,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));

    return NextResponse.json(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
