import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { apiError } from '@/lib/api-response';
import { isSpotifyIntegrationEnabled } from '@/lib/spotify-integration-enabled';
import { getSpotifyAuthorizeUrl } from '@/lib/spotify-user';
import { getRequestOrigin } from '@/lib/app-url';
import crypto from 'crypto';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60, // 10 minutes
};

export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  if (!isSpotifyIntegrationEnabled()) {
    return apiError(
      "Spotify account linking is not enabled. Set NEXT_PUBLIC_ENABLE_SPOTIFY / ENABLE_SPOTIFY_INTEGRATION or hide profile UI with NEXT_PUBLIC_HIDE_SPOTIFY_PROFILE.",
      403,
      { code: "SPOTIFY_LINKING_DISABLED" },
    );
  }

  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') ?? '/profile';
  const state = crypto.randomBytes(32).toString('hex');
  const origin = getRequestOrigin(request);

  const authorizeUrl = getSpotifyAuthorizeUrl(state, origin);
  console.log('[spotify-ingest] spotify-connect-redirect', { userId: me!.id, returnTo, origin });

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
}, { requireAuth: true });
