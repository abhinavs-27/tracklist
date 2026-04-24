import { NextRequest } from 'next/server';
import { getAlbum } from '@/lib/spotify';
import { apiBadRequest, apiOk, apiTooManyRequests } from '@/lib/api-response';
import { isValidSpotifyId } from '@/lib/validation';
import { checkSpotifyRateLimit } from '@/lib/rate-limit';
import { withHandler } from '@/lib/api-handler';

type RouteParams = { id: string };

export const GET = withHandler<RouteParams>(
  async (request: NextRequest, { params }) => {
    if (!checkSpotifyRateLimit(request)) {
      return apiTooManyRequests();
    }
    const { id } = params;
    if (!isValidSpotifyId(id)) return apiBadRequest('Invalid spotify id');

    const album = await getAlbum(id);
    const data = {
      id: album.id,
      name: album.name,
      images: album.images ?? [],
      artists: (album.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
      release_date: album.release_date ?? null,
    };
    return apiOk(data, {
      // Allow intermediate caches (and the browser) to reuse album metadata
      // for a short period; albums change rarely.
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
      },
    });
  },
);

