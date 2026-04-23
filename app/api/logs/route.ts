import type { SupabaseClient } from '@supabase/supabase-js';
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
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
} from '@/lib/catalog/entity-resolution';
import {
  scheduleAlbumEnrichment,
  scheduleArtistEnrichment,
  scheduleTrackEnrichment,
} from '@/lib/catalog/non-blocking-enrichment';
import {
  isValidSpotifyId,
  isValidUuid,
  LIMITS,
  sanitizeString,
} from '@/lib/validation';

type ResolveLogEntityOutcome =
  | { kind: "resolved"; id: string }
  | { kind: "pending"; spotifyId: string; entity: "track" | "album" | "artist" };

async function resolveLogEntityId(
  supabase: SupabaseClient,
  raw: string | null | undefined,
  kind: 'track' | 'album' | 'artist',
): Promise<ResolveLogEntityOutcome | null> {
  if (raw == null) return null;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  if (isValidUuid(s)) return { kind: "resolved", id: s };
  if (!isValidSpotifyId(s)) return null;
  if (kind === 'track') {
    const u = await getTrackIdByExternalId(supabase, 'spotify', s);
    if (!u) {
      scheduleTrackEnrichment(s);
      return { kind: "pending", spotifyId: s, entity: "track" };
    }
    return { kind: "resolved", id: u };
  }
  if (kind === 'album') {
    const u = await getAlbumIdByExternalId(supabase, 'spotify', s);
    if (!u) {
      scheduleAlbumEnrichment(s);
      return { kind: "pending", spotifyId: s, entity: "album" };
    }
    return { kind: "resolved", id: u };
  }
  const u = await getArtistIdByExternalId(supabase, 'spotify', s);
  if (!u) {
    scheduleArtistEnrichment(s);
    return { kind: "pending", spotifyId: s, entity: "artist" };
  }
  return { kind: "resolved", id: u };
}

const LOG_SOURCES = new Set([
  'spotify',
  'manual_import',
  'manual',
  'suggested',
  'session',
  'lastfm',
]);

/** Helper to resolve an entity and return a 503 response if it's pending sync. */
async function resolveAndCheckPending(
  supabase: SupabaseClient,
  id: string | null | undefined,
  kind: 'track' | 'album' | 'artist',
) {
  const res = await resolveLogEntityId(supabase, id, kind);
  if (res?.kind === 'pending') {
    return {
      pending: true,
      errorResponse: apiServiceUnavailable(
        `Catalog is syncing this ${kind} from Spotify. Retry in a few seconds.`,
        {
          code: 'catalog_pending',
          metadata_complete: false,
          spotify_id: res.spotifyId,
          entity: res.entity,
        }
      )
    };
  }
  return { pending: false, id: res?.kind === 'resolved' ? res.id : null };
}

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

    const trackRes = await resolveAndCheckPending(supabase, trackRaw, 'track');
    if (trackRes.pending) return trackRes.errorResponse!;
    const trackId = trackRes.id;
    if (!trackId) {
      return apiBadRequest('Invalid or unknown track_id / spotify_id');
    }

    const albumRes = await resolveAndCheckPending(supabase, b.album_id, 'album');
    if (albumRes.pending) return albumRes.errorResponse!;
    const albumId = albumRes.id;

    const artistRes = await resolveAndCheckPending(supabase, b.artist_id, 'artist');
    if (artistRes.pending) return artistRes.errorResponse!;
    const artistId = artistRes.id;

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
