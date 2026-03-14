import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase';
import { apiUnauthorized, apiBadRequest, apiInternalError } from '@/lib/api-response';
import { getRecentlyPlayed, getValidSpotifyAccessToken } from '@/lib/spotify-user';
import { checkSpotifyRateLimit } from '@/lib/rate-limit';

type SyncResponse = {
  inserted: number;
  skipped: number;
  mode: 'song';
};

export async function POST(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const mode = 'song' as const;

    let accessToken: string;
    try {
      accessToken = await getValidSpotifyAccessToken(session.user.id);
    } catch (e) {
      if (e instanceof Error && e.message === 'Spotify not connected') return apiBadRequest('Spotify not connected');
      return apiInternalError(e);
    }

    const supabase = await createSupabaseServerClient();
    const recent = await getRecentlyPlayed(accessToken, 50);
    const items = recent.items ?? [];

    const candidates: Array<{ track_id: string; listened_at: string }> = [];

    for (const it of items) {
      const playedAt = it.played_at;
      const track = it.track;
      if (!track?.id || !playedAt) continue;

      candidates.push({ track_id: track.id, listened_at: playedAt });
    }

    if (candidates.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: 0, mode } satisfies SyncResponse);
    }

    const keyToItem = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
      const key = c.track_id;
      const prev = keyToItem.get(key);
      if (!prev || Date.parse(c.listened_at) > Date.parse(prev.listened_at)) keyToItem.set(key, c);
    }
    const unique = [...keyToItem.values()];

    const trackIds = [...new Set(unique.map((u) => u.track_id))];
    const { data: existing, error: existingError } = await supabase
      .from('logs')
      .select('track_id')
      .eq('user_id', session.user.id)
      .in('track_id', trackIds);
    if (existingError) return apiInternalError(existingError);

    const existingSet = new Set(
      (existing ?? []).map((l: { track_id: string }) => l.track_id),
    );

    const toInsert = unique.filter((u) => !existingSet.has(u.track_id));
    if (toInsert.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: unique.length, mode } satisfies SyncResponse);
    }

    const nowIso = new Date().toISOString();
    const { error: insertError } = await supabase.from('logs').insert(
      toInsert.map((u) => ({
        user_id: session.user.id,
        track_id: u.track_id,
        listened_at: new Date(u.listened_at).toISOString(),
        source: 'spotify',
        created_at: nowIso,
      })),
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

