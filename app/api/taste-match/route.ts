import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiInternalError } from '@/lib/api-response';
import { isValidUuid } from '@/lib/validation';
import type { TasteMatchResponse } from '@/types';

type ReviewRow = {
  entity_id: string;
  rating: number;
  created_at: string;
};

function uniqueLatestByEntityId(rows: ReviewRow[]) {
  const map = new Map<string, ReviewRow>();
  for (const row of rows) {
    if (!map.has(row.entity_id)) map.set(row.entity_id, row);
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
        .from('reviews')
        .select('entity_id, rating, created_at')
        .eq('user_id', userA)
        .eq('entity_type', 'album')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('reviews')
        .select('entity_id, rating, created_at')
        .eq('user_id', userB)
        .eq('entity_type', 'album')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (aRes.error) return apiInternalError(aRes.error);
    if (bRes.error) return apiInternalError(bRes.error);

    const aRows = (aRes.data ?? []) as ReviewRow[];
    const bRows = (bRes.data ?? []) as ReviewRow[];

    const aMap = uniqueLatestByEntityId(aRows);
    const bMap = uniqueLatestByEntityId(bRows);

    const aTotal = aMap.size;
    const bTotal = bMap.size;
    const denom = Math.max(aTotal, bTotal, 1);

    const sharedAlbums: TasteMatchResponse['sharedAlbums'] = [];
    for (const entityId of aMap.keys()) {
      const b = bMap.get(entityId);
      if (!b) continue;
      const a = aMap.get(entityId)!;
      sharedAlbums.push({
        spotify_id: entityId,
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
