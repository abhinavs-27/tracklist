const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export type SpotifyRecentlyPlayedResponse = {
  items: Array<{
    played_at: string;
    track: {
      id: string;
      type: 'track';
      name: string;
      album?: { id: string; name: string; images?: { url: string }[] };
    };
  }>;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function buildRedirectUri(): string {
  // Prefer explicit URI because Spotify requires an exact match.
  const explicit = process.env.SPOTIFY_REDIRECT_URI;
  if (explicit) return explicit;
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/spotify/callback`;
}

export function getSpotifyAuthorizeUrl(state: string): string {
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID');
  const redirectUri = buildRedirectUri();
  const scopes = ['user-read-recently-played'];

  const url = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('show_dialog', 'true');
  return url.toString();
}

export async function exchangeSpotifyCode(code: string): Promise<SpotifyTokenResponse> {
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = requiredEnv('SPOTIFY_CLIENT_SECRET');
  const redirectUri = buildRedirectUri();

  const res = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange error: ${res.status} ${text}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

export async function refreshSpotifyAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const clientId = requiredEnv('SPOTIFY_CLIENT_ID');
  const clientSecret = requiredEnv('SPOTIFY_CLIENT_SECRET');

  const res = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify refresh error: ${res.status} ${text}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

export async function getRecentlyPlayed(accessToken: string, limit = 50): Promise<SpotifyRecentlyPlayedResponse> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const url = new URL(`${SPOTIFY_API_BASE}/me/player/recently-played`);
  url.searchParams.set('limit', String(safeLimit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify recently-played error: ${res.status} ${text}`);
  }

  return (await res.json()) as SpotifyRecentlyPlayedResponse;
}

