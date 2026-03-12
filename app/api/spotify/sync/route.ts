import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase';
import { apiUnauthorized, apiBadRequest, apiInternalError } from '@/lib/api-response';
import { getRecentlyPlayed, getValidSpotifyAccessToken } from '@/lib/spotify-user';

type SyncResponse = {
  inserted: number;
  skipped: number;
  mode: 'album' | 'song' | 'both';
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const url = new URL(request.url);
    const modeParam = url.searchParams.get('mode');
    const mode = (modeParam === 'album' || modeParam === 'song' || modeParam === 'both' ? modeParam : 'album') as
      | 'album'
      | 'song'
      | 'both';

    let accessToken: string;
    try {
      accessToken = await getValidSpotifyAccessToken(session.user.id);
    } catch (e) {
      if (e instanceof Error && e.message === 'Spotify not connected') return apiBadRequest('Spotify not connected');
      return apiInternalError(e);
    }

    const supabase = createSupabaseServerClient();
    const recent = await getRecentlyPlayed(accessToken, 50);
    const items = recent.items ?? [];

    const candidates: Array<{ spotify_id: string; type: 'album' | 'song'; listened_at: string; title?: string | null }> =
      [];

    for (const it of items) {
      const playedAt = it.played_at;
      const track = it.track;
      if (!track?.id || !playedAt) continue;

      if (mode === 'song' || mode === 'both') {
        candidates.push({ spotify_id: track.id, type: 'song', listened_at: playedAt, title: track.name ?? null });
      }

      const albumId = track.album?.id;
      if ((mode === 'album' || mode === 'both') && albumId) {
        candidates.push({ spotify_id: albumId, type: 'album', listened_at: playedAt, title: track.album?.name ?? null });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: 0, mode } satisfies SyncResponse);
    }

    // Deduplicate within this sync batch by (type, spotify_id), keeping the newest listened_at.
    const keyToItem = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
      const key = `${c.type}:${c.spotify_id}`;
      const prev = keyToItem.get(key);
      if (!prev || Date.parse(c.listened_at) > Date.parse(prev.listened_at)) keyToItem.set(key, c);
    }
    const unique = [...keyToItem.values()];

    // Fetch existing logs for these spotify_ids (any type), then we’ll filter by type in JS.
    const spotifyIds = [...new Set(unique.map((u) => u.spotify_id))];
    const { data: existing, error: existingError } = await supabase
      .from('logs')
      .select('spotify_id, type')
      .eq('user_id', session.user.id)
      .in('spotify_id', spotifyIds);
    if (existingError) return apiInternalError(existingError);

    const existingSet = new Set(
      (existing ?? []).map((l: { spotify_id: string; type: 'album' | 'song' }) => `${l.type}:${l.spotify_id}`)
    );

    const toInsert = unique.filter((u) => !existingSet.has(`${u.type}:${u.spotify_id}`));
    if (toInsert.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: unique.length, mode } satisfies SyncResponse);
    }

    const nowIso = new Date().toISOString();
    const { error: insertError } = await supabase.from('logs').insert(
      toInsert.map((u) => ({
        user_id: session.user.id,
        spotify_id: u.spotify_id,
        type: u.type,
        title: u.title ?? null,
        rating: 3, // placeholder until ratings/reviews are added to sync flow
        review: null,
        listened_at: new Date(u.listened_at).toISOString(),
        created_at: nowIso,
      }))
    );
    if (insertError) return apiInternalError(insertError);

    return NextResponse.json({
      inserted: toInsert.length,
      skipped: unique.length - toInsert.length,
      mode,
    } satisfies SyncResponse);
  } catch (e) {
    return apiInternalError(e);
  }
}

