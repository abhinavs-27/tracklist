import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError } from '@/lib/api-response';
import { isValidUuid } from '@/lib/validation';
import type { TasteMatchResponse } from '@/types';

type AlbumLogRow = {
  spotify_id: string;
  rating: number;
  created_at: string;
};

function uniqueLatestBySpotifyId(rows: AlbumLogRow[]) {
  const map = new Map<string, AlbumLogRow>();
  for (const row of rows) {
    if (!map.has(row.spotify_id)) map.set(row.spotify_id, row);
  }
  return map;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userA = searchParams.get('userA');
    const userB = searchParams.get('userB');

    if (!userA || !userB) return apiBadRequest('Missing userA or userB');
    if (!isValidUuid(userA) || !isValidUuid(userB)) return apiBadRequest('Invalid user id');
    if (userA === userB) {
      const body: TasteMatchResponse = {
        score: 100,
        sharedAlbumCount: 0,
        sharedAlbums: [],
      };
      return NextResponse.json(body);
    }

    const supabase = createSupabaseServerClient();

    const [aRes, bRes] = await Promise.all([
      supabase
        .from('logs')
        .select('spotify_id, rating, created_at')
        .eq('user_id', userA)
        .eq('type', 'album')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('logs')
        .select('spotify_id, rating, created_at')
        .eq('user_id', userB)
        .eq('type', 'album')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (aRes.error) return apiInternalError(aRes.error);
    if (bRes.error) return apiInternalError(bRes.error);

    const aRows = (aRes.data ?? []) as AlbumLogRow[];
    const bRows = (bRes.data ?? []) as AlbumLogRow[];

    const aMap = uniqueLatestBySpotifyId(aRows);
    const bMap = uniqueLatestBySpotifyId(bRows);

    const aTotal = aMap.size;
    const bTotal = bMap.size;
    const denom = Math.max(aTotal, bTotal, 1);

    const sharedAlbums: TasteMatchResponse['sharedAlbums'] = [];
    for (const spotifyId of aMap.keys()) {
      const b = bMap.get(spotifyId);
      if (!b) continue;
      const a = aMap.get(spotifyId)!;
      sharedAlbums.push({
        spotify_id: spotifyId,
        rating_userA: a.rating ?? null,
        rating_userB: b.rating ?? null,
      });
    }

    const sharedAlbumCount = sharedAlbums.length;
    const score = Math.round((sharedAlbumCount / denom) * 100);

    const body: TasteMatchResponse = {
      score: Math.max(0, Math.min(100, score)),
      sharedAlbumCount,
      sharedAlbums,
    };

    return NextResponse.json(body);
  } catch (e) {
    return apiInternalError(e);
  }
}

