import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { apiInternalError } from '@/lib/api-response';
import { getSpotifyAuthorizeUrl } from '@/lib/spotify-user';
import { getRequestOrigin } from '@/lib/app-url';
import crypto from 'crypto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60, // 10 minutes
};

export async function GET(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const url = new URL(request.url);
    const returnTo = url.searchParams.get('returnTo') ?? '/profile';
    const state = crypto.randomBytes(32).toString('hex');
    const origin = getRequestOrigin(request);

    const authorizeUrl = getSpotifyAuthorizeUrl(state, origin);
    console.log('[spotify-ingest] spotify-connect-redirect', { userId: session.user.id, returnTo, origin });

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

