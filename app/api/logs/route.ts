import { withHandler } from '@/lib/api-handler';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { grantAchievementsOnListen, getListenLogsForUser } from '@/lib/queries';
import { syncManualLogSideEffects } from '@/lib/sync-manual-log-side-effects';
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
  apiServiceUnavailable,
} from '@/lib/api-response';
import { parseBody, getPaginationParams } from '@/lib/api-utils';
import { LogCreateBody } from '@/types';
import {
  resolveEntityWithPending,
} from '@/lib/catalog/entity-resolution';
import {
  isValidSpotifyId,
  LIMITS,
  sanitizeString,
} from '@/lib/validation';

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
    const trackIdRes = await resolveEntityWithPending(supabase, trackRaw, 'track');
    if (!trackIdRes) {
      return apiBadRequest('Invalid or unknown track_id / spotify_id');
    }
    if (trackIdRes.kind === 'pending') {
      return apiServiceUnavailable(
        'Catalog is syncing this track from Spotify. Retry in a few seconds.',
        {
          code: 'catalog_pending',
          metadata_complete: false,
          spotify_id: trackIdRes.spotifyId,
          entity: trackIdRes.entity,
        }
      );
    }
    const trackId = trackIdRes.id;

    const albumRes = await resolveEntityWithPending(supabase, b.album_id, 'album');
    if (albumRes?.kind === 'pending') {
      return apiServiceUnavailable(
        'Catalog is syncing this album from Spotify. Retry in a few seconds.',
        {
          code: 'catalog_pending',
          metadata_complete: false,
          spotify_id: albumRes.spotifyId,
          entity: albumRes.entity,
        }
      );
    }
    const albumId = albumRes?.kind === 'resolved' ? albumRes.id : null;

    const artistRes = await resolveEntityWithPending(supabase, b.artist_id, 'artist');
    if (artistRes?.kind === 'pending') {
      return apiServiceUnavailable(
        'Catalog is syncing this artist from Spotify. Retry in a few seconds.',
        {
          code: 'catalog_pending',
          metadata_complete: false,
          spotify_id: artistRes.spotifyId,
          entity: artistRes.entity,
        }
      );
    }
    const artistId = artistRes?.kind === 'resolved' ? artistRes.id : null;

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
    const { searchParams } = request.nextUrl;
    const spotifyId = searchParams.get('spotify_id');
    const { limit } = getPaginationParams(searchParams, 20, LIMITS.LOGS_LIMIT);

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
