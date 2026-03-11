import { NextRequest, NextResponse } from 'next/server';
import { getAlbum } from '@/lib/spotify';
import { apiBadRequest, apiInternalError } from '@/lib/api-response';
import { isValidSpotifyId } from '@/lib/validation';

type RouteParams = {
  id: string;
};

export async function GET(_request: NextRequest, ctx: { params: RouteParams }) {
  try {
    const { id } = ctx.params;
    if (!isValidSpotifyId(id)) return apiBadRequest('Invalid spotify id');

    const album = await getAlbum(id);
    return NextResponse.json(
      {
        id: album.id,
        name: album.name,
        images: album.images ?? [],
        artists: (album.artists ?? []).map((a) => ({ id: a.id, name: a.name })),
        release_date: album.release_date ?? null,
      },
      {
        // Allow intermediate caches (and the browser) to reuse album metadata
        // for a short period; albums change rarely.
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
        },
      }
    );
  } catch (e) {
    return apiInternalError(e);
  }
}

