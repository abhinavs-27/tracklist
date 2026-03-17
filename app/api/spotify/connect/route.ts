import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { apiUnauthorized, apiInternalError } from '@/lib/api-response';
import { getSpotifyAuthorizeUrl } from '@/lib/spotify-user';
import { getRequestOrigin } from '@/lib/app-url';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import crypto from 'crypto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60, // 10 minutes
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const url = new URL(request.url);
    const returnTo = url.searchParams.get('returnTo') ?? '/profile';
    const state = crypto.randomBytes(32).toString('hex');
    const origin = getRequestOrigin(request);

    const authorizeUrl = getSpotifyAuthorizeUrl(state, origin);
    console.log('[spotify-ingest] spotify connect: redirecting to authorize', { userId: session.user.id, returnTo, origin });

    const res = NextResponse.redirect(authorizeUrl, { status: 302 });
    res.cookies.set('spotify_oauth_state', state, {
      ...COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === 'production',
    });
    res.cookies.set('spotify_oauth_return_to', returnTo, {
      ...COOKIE_OPTIONS,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (e) {
    console.error('Spotify connect error:', e);
    return apiInternalError(e);
  }
}

