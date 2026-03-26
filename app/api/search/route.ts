import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { searchSpotify } from '@/lib/spotify';
import { apiBadRequest, apiOk } from '@/lib/api-response';
import { validateSearchQuery, clampLimit, LIMITS } from '@/lib/validation';

type SearchType = 'artist' | 'album' | 'track';

const EMPTY_SEARCH = {
  artists: { items: [] as SpotifyApi.ArtistObjectFull[] },
  albums: { items: [] as SpotifyApi.AlbumObjectSimplified[] },
  tracks: { items: [] as SpotifyApi.TrackObjectFull[] },
};

export const GET = withHandler(async (req: NextRequest) => {
  // Use Next.js App Router's nextUrl to safely read query parameters.
  const { searchParams } = req.nextUrl;

  const rawQ = searchParams.get('q');
  const typeParam = searchParams.get('type') || 'artist,album,track';
  const limit = clampLimit(searchParams.get('limit'), LIMITS.SEARCH_LIMIT, 10);

  // Validate and normalize the search query.
  const queryResult = validateSearchQuery(rawQ);
  if (!queryResult.ok) {
    return apiBadRequest(queryResult.error);
  }

  // Parse and validate types; fall back to all types if none are valid.
  const requestedTypes = typeParam
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is SearchType => t === 'artist' || t === 'album' || t === 'track');

  const searchTypes: SearchType[] =
    requestedTypes.length > 0 ? requestedTypes : ['artist', 'album', 'track'];

  // Delegate to the Spotify helper, which correctly encodes and calls the Spotify API.
  const result = await searchSpotify(queryResult.value, searchTypes, limit);

  return apiOk(result);
});
