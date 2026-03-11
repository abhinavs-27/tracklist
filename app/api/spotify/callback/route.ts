import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { apiBadRequest, apiUnauthorized, apiInternalError } from '@/lib/api-response';
import { exchangeSpotifyCode } from '@/lib/spotify-user';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) return apiBadRequest(`Spotify OAuth error: ${error}`);
    if (!code) return apiBadRequest('Missing code');
    if (!state) return apiBadRequest('Missing state');

    const cookieState = request.cookies.get('spotify_oauth_state')?.value;
    if (!cookieState || cookieState !== state) return apiBadRequest('Invalid OAuth state');

    const token = await exchangeSpotifyCode(code);
    if (!token.access_token || !token.expires_in) return apiBadRequest('Invalid token response');

    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
    const refreshToken = token.refresh_token;
    if (!refreshToken) return apiBadRequest('Missing refresh_token (check Spotify app settings)');

    const supabase = createSupabaseServerClient();
    const { error: upsertError } = await supabase.from('spotify_tokens').upsert(
      {
        user_id: session.user.id,
        access_token: token.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (upsertError) return apiInternalError(upsertError);

    const cookieReturnTo = request.cookies.get('spotify_oauth_return_to')?.value;
    const fallback = `/profile/${session.user.username ?? ''}`;
    const returnTo =
      cookieReturnTo && cookieReturnTo.startsWith('/') && !cookieReturnTo.startsWith('//')
        ? cookieReturnTo
        : fallback;

    const res = NextResponse.redirect(returnTo, { status: 302 });
    res.cookies.set('spotify_oauth_state', '', { path: '/', maxAge: 0 });
    res.cookies.set('spotify_oauth_return_to', '', { path: '/', maxAge: 0 });
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
}

