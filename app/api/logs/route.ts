import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase';
import { grantAchievementsOnListen, getListenLogsForUser } from '@/lib/queries';
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

    // Reuse shared query logic for fetching logs with user data
    const logs = await getListenLogsForUser(
      session.user.id,
      limit,
      0,
      spotifyId || undefined
    );

    return apiOk(logs);
  } catch (e) {
    return apiInternalError(e);
  }
}
