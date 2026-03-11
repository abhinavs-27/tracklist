import { NextRequest, NextResponse } from 'next/server';
import { searchSpotify } from '@/lib/spotify';
import { apiBadRequest, apiInternalError } from '@/lib/api-response';
import { validateSearchQuery, clampLimit, LIMITS } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const typeParam = searchParams.get('type') || 'artist,album,track';
    const limit = clampLimit(searchParams.get('limit'), LIMITS.SEARCH_LIMIT, 20);

    const queryResult = validateSearchQuery(q);
    if (!queryResult.ok) return apiBadRequest(queryResult.error);

    const types = typeParam
      .split(',')
      .map((t) => t.trim())
      .filter((t) => ['artist', 'album', 'track'].includes(t)) as ('artist' | 'album' | 'track')[];
    const searchTypes: ('artist' | 'album' | 'track')[] =
      types.length > 0 ? types : ['artist', 'album', 'track'];

    const result = await searchSpotify(queryResult.value, searchTypes, limit);
    return NextResponse.json(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
