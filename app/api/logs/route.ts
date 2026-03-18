import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase';
import { grantAchievementsOnListen } from '@/lib/queries';
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody } from '@/lib/api-utils';
import {
  isValidSpotifyId,
  clampLimit,
  LIMITS,
} from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const b = body!;
    const { track_id: bodyTrackId, spotify_id, listened_at } = b;
    const trackId = (bodyTrackId ?? spotify_id) as string | undefined;

    if (!trackId) {
      return apiBadRequest('Missing required field: track_id or spotify_id');
    }
    if (!isValidSpotifyId(trackId)) {
      return apiBadRequest('Invalid track_id format');
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

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('logs')
      .insert({
        user_id: session.user.id,
        track_id: trackId,
        listened_at: listenedAt,
        source: 'manual_import',
      })
      .select('id, user_id, track_id, listened_at, source, created_at')
      .single();

    if (error) {
      console.error('Log create error:', error);
      return apiInternalError(error);
    }
    await grantAchievementsOnListen(session.user.id);
    console.log("[logs] manual-log-created", {
      userId: session.user.id,
      trackId,
    });
    return apiOk(data);
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const spotifyId = searchParams.get('spotify_id');
    const limit = clampLimit(searchParams.get('limit'), LIMITS.LOGS_LIMIT, 20);

    if (spotifyId && !isValidSpotifyId(spotifyId)) {
      return apiBadRequest('Invalid spotify_id');
    }

    const userId = session.user.id;

    const supabase = await createSupabaseServerClient();

    let query = supabase
      .from('logs')
      .select('id, user_id, track_id, listened_at, source, created_at')
      .eq('user_id', userId)
      .order('listened_at', { ascending: false })
      .limit(limit);

    if (spotifyId) query = query.eq('track_id', spotifyId);

    const { data: logs, error: logsError } = await query;

    if (logsError) {
      console.error('Logs GET error:', logsError);
      return apiInternalError(logsError);
    }

    if (!logs?.length) return apiOk([]);

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
      track_id: log.track_id,
      listened_at: log.listened_at,
      source: log.source ?? null,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));

    return apiOk(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
