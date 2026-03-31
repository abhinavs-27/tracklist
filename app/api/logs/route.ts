import type { SupabaseClient } from '@supabase/supabase-js';
import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { grantAchievementsOnListen, getListenLogsForUser } from '@/lib/queries';
import { syncManualLogSideEffects } from '@/lib/sync-manual-log-side-effects';
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from '@/lib/api-response';
import { parseBody } from '@/lib/api-utils';
import { LogCreateBody } from '@/types';
import {
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
} from '@/lib/catalog/entity-resolution';
import {
  getOrFetchAlbum,
  getOrFetchArtist,
  getOrFetchTrack,
} from '@/lib/spotify-cache';
import {
  isValidSpotifyId,
  isValidUuid,
  clampLimit,
  LIMITS,
  sanitizeString,
} from '@/lib/validation';

async function resolveLogEntityId(
  supabase: SupabaseClient,
  raw: string | null | undefined,
  kind: 'track' | 'album' | 'artist',
): Promise<string | null> {
  if (raw == null) return null;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  if (isValidUuid(s)) return s;
  if (!isValidSpotifyId(s)) return null;
  if (kind === 'track') {
    let u = await getTrackIdByExternalId(supabase, 'spotify', s);
    if (!u) {
      await getOrFetchTrack(s, { allowNetwork: true });
      u = await getTrackIdByExternalId(supabase, 'spotify', s);
    }
    return u;
  }
  if (kind === 'album') {
    let u = await getAlbumIdByExternalId(supabase, 'spotify', s);
    if (!u) {
      await getOrFetchAlbum(s, { allowNetwork: true });
      u = await getAlbumIdByExternalId(supabase, 'spotify', s);
    }
    return u;
  }
  let u = await getArtistIdByExternalId(supabase, 'spotify', s);
  if (!u) {
    await getOrFetchArtist(s, { allowNetwork: true });
    u = await getArtistIdByExternalId(supabase, 'spotify', s);
  }
  return u;
}

const LOG_SOURCES = new Set([
  'spotify',
  'manual_import',
  'manual',
  'suggested',
  'session',
  'lastfm',
]);

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<LogCreateBody>(request);
    if (parseErr) return parseErr;

    const b = body!;
    const { track_id: bodyTrackId, spotify_id, listened_at } = b;
    const trackRaw = (bodyTrackId ?? spotify_id) as string | undefined;

    if (!trackRaw?.trim()) {
      return apiBadRequest('Missing required field: track_id or spotify_id');
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

    const rawSource = typeof b.source === 'string' ? b.source : 'manual_import';
    const source = LOG_SOURCES.has(rawSource) ? rawSource : 'manual_import';

    const note = sanitizeString(b.note, LIMITS.COMMENT_CONTENT);

    const supabase = await createSupabaseServerClient();
    const trackId = await resolveLogEntityId(supabase, trackRaw, 'track');
    if (!trackId) {
      return apiBadRequest('Invalid or unknown track_id / spotify_id');
    }
    const albumId = await resolveLogEntityId(supabase, b.album_id, 'album');
    const artistId = await resolveLogEntityId(supabase, b.artist_id, 'artist');

    const { data, error } = await supabase
      .from('logs')
      .insert({
        user_id: me!.id,
        track_id: trackId,
        listened_at: listenedAt,
        source,
        album_id: albumId,
        artist_id: artistId,
        note,
      })
      .select(
        'id, track_id, listened_at, source, created_at, album_id, artist_id, note',
      )
      .single();

    if (error) {
      console.error('Log create error:', error);
      return apiInternalError(error);
    }
    await grantAchievementsOnListen(me!.id);
    await syncManualLogSideEffects(me!.id, trackId, listenedAt);
    try {
      const { fanOutListenForUserCommunities } = await import(
        "@/lib/community/community-feed-insert"
      );
      await fanOutListenForUserCommunities({
        userId: me!.id,
        logId: data.id as string,
        listenedAt: listenedAt,
        source,
        trackId,
        albumId: albumId,
        artistId: artistId,
        title: null,
      });
    } catch (e) {
      console.warn("[logs] community_feed fan-out", e);
    }
    console.log("[logs] manual-log-created", {
      userId: me!.id,
      trackId,
    });
    return apiOk(data);
  },
  { requireAuth: true }
);

export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = new URL(request.url);
    const spotifyId = searchParams.get('spotify_id');
    const limit = clampLimit(searchParams.get('limit'), LIMITS.LOGS_LIMIT, 20);

    if (spotifyId && !isValidSpotifyId(spotifyId)) {
      return apiBadRequest('Invalid spotify_id');
    }

    // Reuse shared query logic for fetching logs with user data
    const logs = await getListenLogsForUser(
      me!.id,
      limit,
      0,
      spotifyId || undefined
    );

    return apiOk(logs);
  },
  { requireAuth: true }
);
