import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAppBaseUrl, isLocalhostUrl } from "@/lib/app-url";
import {
  isSpotifyIntegrationEnabled,
  SPOTIFY_DISABLED_API_MESSAGE,
} from "@/lib/spotify-integration-enabled";

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/** Buffer in ms before expiry to refresh early (e.g. 60s). */
const EXPIRY_BUFFER_MS = 60_000;

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
    track: SpotifyApi.TrackObjectFull;
  }>;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/** Builds the OAuth redirect URI (no trailing slash). Must match exactly in Spotify Dashboard. */
function buildRedirectUri(): string {
  const explicit = process.env.SPOTIFY_REDIRECT_URI?.trim();
  // In production, never use a localhost redirect URI (e.g. SPOTIFY_REDIRECT_URI copied from .env.local).
  const isProduction = process.env.NODE_ENV === "production";
  let uri: string;
  if (explicit && (!isProduction || !isLocalhostUrl(explicit))) {
    uri = explicit;
  } else {
    const base = getAppBaseUrl();
    uri = new URL("/api/spotify/callback", base).toString();
  }
  return uri.replace(/\/$/, "");
}

/** Build redirect URI from request origin so it always matches the URL the user is on (e.g. tracklistsocial.com). */
export function buildRedirectUriFromOrigin(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/spotify/callback`;
}

export function getSpotifyAuthorizeUrl(
  state: string,
  /** When provided (e.g. from request), ensures redirect_uri matches the host the user is visiting. */
  requestOrigin?: string,
): string {
  const clientId = requiredEnv("SPOTIFY_CLIENT_ID");
  const redirectUri = requestOrigin
    ? buildRedirectUriFromOrigin(requestOrigin)
    : buildRedirectUri();
  console.log(
    "Spotify authorize: redirect_uri (add this exact URL in Spotify Dashboard):",
    redirectUri,
  );
  const scopes = [
    "user-read-recently-played",
    "user-read-email",
    "user-read-private",
    "user-library-read",
  ];

  const url = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("show_dialog", "true");
  return url.toString();
}

export async function exchangeSpotifyCode(
  code: string,
  /** Must match the redirect_uri used in the authorize request (e.g. from callback request origin). */
  redirectUriOverride?: string,
): Promise<SpotifyTokenResponse> {
  if (!isSpotifyIntegrationEnabled()) {
    throw new Error(SPOTIFY_DISABLED_API_MESSAGE);
  }

  const clientId = requiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SPOTIFY_CLIENT_SECRET");
  const redirectUri = redirectUriOverride ?? buildRedirectUri();

  const res = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
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

export async function refreshSpotifyAccessToken(
  refreshToken: string,
): Promise<SpotifyTokenResponse> {
  if (!isSpotifyIntegrationEnabled()) {
    throw new Error(SPOTIFY_DISABLED_API_MESSAGE);
  }

  const clientId = requiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SPOTIFY_CLIENT_SECRET");

  const res = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify refresh error: ${res.status} ${text}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

/**
 * Returns a valid Spotify access token for the user, refreshing from DB and
 * calling Spotify refresh if expired. Use this before any Spotify API call.
 * @throws Error "Spotify not connected" if no tokens stored, or rethrows on refresh failure.
 */
export async function getValidSpotifyAccessToken(
  userId: string,
): Promise<string> {
  if (!isSpotifyIntegrationEnabled()) {
    throw new Error(SPOTIFY_DISABLED_API_MESSAGE);
  }

  const supabase = createSupabaseAdminClient();
  const { data: row, error: fetchError } = await supabase
    .from("spotify_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (fetchError || !row?.access_token || !row?.refresh_token) {
    console.warn("getValidSpotifyAccessToken: no tokens for user", {
      userId,
      fetchError: fetchError?.message,
    });
    throw new Error("Spotify not connected");
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const now = Date.now();
  const stillValid = expiresAt > now + EXPIRY_BUFFER_MS;

  if (stillValid) {
    console.log("getValidSpotifyAccessToken: token still valid", {
      userId,
      expiresAt: row.expires_at,
    });
    return row.access_token;
  }

  console.log(
    "getValidSpotifyAccessToken: token expired or expiring soon, refreshing",
    { userId },
  );
  let refreshed: SpotifyTokenResponse;
  try {
    refreshed = await refreshSpotifyAccessToken(row.refresh_token);
  } catch (e) {
    console.error("getValidSpotifyAccessToken: refresh failed", {
      userId,
      error: e,
    });
    if (e instanceof Error && e.message)
      console.error("Spotify refresh error response:", e.message);
    throw e;
  }

  const newExpiresAt = new Date(
    Date.now() + refreshed.expires_in * 1000,
  ).toISOString();
  const updatedAt = new Date().toISOString();
  const updatePayload: Record<string, string> = {
    access_token: refreshed.access_token,
    expires_at: newExpiresAt,
    updated_at: updatedAt,
  };
  if (refreshed.refresh_token)
    updatePayload.refresh_token = refreshed.refresh_token;

  const { error: updateError } = await supabase
    .from("spotify_tokens")
    .update(updatePayload)
    .eq("user_id", userId);

  if (updateError) {
    console.error("getValidSpotifyAccessToken: database update failed", {
      userId,
      updateError,
    });
    throw new Error("Failed to save refreshed token");
  }
  console.log("getValidSpotifyAccessToken: database updated with new token", {
    userId,
  });
  return refreshed.access_token;
}

export async function getRecentlyPlayed(
  accessToken: string,
  limit = 50,
): Promise<SpotifyRecentlyPlayedResponse> {
  if (!isSpotifyIntegrationEnabled()) {
    throw new Error(SPOTIFY_DISABLED_API_MESSAGE);
  }

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const url = new URL(`${SPOTIFY_API_BASE}/me/player/recently-played`);
  url.searchParams.set("limit", String(safeLimit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify recently-played error: ${res.status} ${text}`);
  }

  return (await res.json()) as SpotifyRecentlyPlayedResponse;
}

// ------------------------------------------------------------
// Generic helpers for user-authenticated Spotify API calls
// ------------------------------------------------------------

async function spotifyUserFetch<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  if (!isSpotifyIntegrationEnabled()) {
    throw new Error(SPOTIFY_DISABLED_API_MESSAGE);
  }

  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn("spotifyUserFetch error", {
      path,
      status: res.status,
      body: text,
    });
    throw new Error(`Spotify user API error: ${res.status} ${path} ${text}`);
  }

  return (await res.json()) as T;
}

export async function getUserArtist(
  accessToken: string,
  artistId: string,
): Promise<SpotifyApi.ArtistObjectFull> {
  return spotifyUserFetch<SpotifyApi.ArtistObjectFull>(
    accessToken,
    `/artists/${artistId}`,
  );
}

export async function getUserArtistAlbums(
  accessToken: string,
  artistId: string,
  limit = 10,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  // Some environments enforce a maximum of 10 for this endpoint
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyUserFetch<
    SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>
  >(accessToken, `/artists/${artistId}/albums`, { limit: String(safeLimit) });
}
