import { NextRequest } from 'next/server';
import { handleUnauthorized, requireApiAuth } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { grantAchievementsOnListen, getListenLogsForUser } from '@/lib/queries';
import {
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
    const me = await requireApiAuth(request);

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
        user_id: me.id,
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
    await grantAchievementsOnListen(me.id);
    console.log("[logs] manual-log-created", {
      userId: me.id,
      trackId,
    });
    return apiOk(data);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { searchParams } = new URL(request.url);
    const spotifyId = searchParams.get('spotify_id');
    const limit = clampLimit(searchParams.get('limit'), LIMITS.LOGS_LIMIT, 20);

    if (spotifyId && !isValidSpotifyId(spotifyId)) {
      return apiBadRequest('Invalid spotify_id');
    }

    // Reuse shared query logic for fetching logs with user data
    const logs = await getListenLogsForUser(
      me.id,
      limit,
      0,
      spotifyId || undefined
    );

    return apiOk(logs);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
