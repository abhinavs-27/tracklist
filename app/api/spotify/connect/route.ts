import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { apiUnauthorized, apiInternalError } from '@/lib/api-response';
import { getSpotifyAuthorizeUrl } from '@/lib/spotify-user';

function randomState() {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const url = new URL(request.url);
    const returnTo = url.searchParams.get('returnTo') || '/profile';
    const state = randomState();

    const res = NextResponse.redirect(getSpotifyAuthorizeUrl(state), { status: 302 });
    res.cookies.set('spotify_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    });
    res.cookies.set('spotify_oauth_return_to', returnTo, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    });
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
}

