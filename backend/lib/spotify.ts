/// <reference path="../types/spotify-api.d.ts" />

import { SpotifyRateLimitError } from "./spotify-errors";

/**
 * Mirrors `lib/spotify.ts` (client-credentials). Same allowed endpoints; no bulk `?ids=`,
 * no artist top-tracks or Spotify recommendations/browse APIs.
 */

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

function withTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(id);
  });
}

async function getClientCredentialsToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  }

  const res = await withTimeout(
    `${SPOTIFY_ACCOUNTS_BASE}/api/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    },
    DEFAULT_TIMEOUT_MS,
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token error: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return data.access_token;
}

async function spotifyFetch<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const token = await getClientCredentialsToken();

    const res = await withTimeout(
      url.toString(),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (res.ok) {
      const data = (await res.json()) as T;
      return data;
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : null;
      const ra =
        retryAfterSeconds != null && Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds
          : null;
      throw new SpotifyRateLimitError(
        `Spotify API rate limited for ${path}` +
          (ra != null ? ` (Retry-After: ${ra}s)` : ""),
        ra,
      );
    }

    // If the token is invalid/expired earlier than expected, clear cache and retry once.
    if (res.status === 401) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      lastError = new Error(`Spotify API unauthorized for ${path}`);
      continue;
    }

    // 403: app policy / Dev Mode — not fixed by a new token (401 is for invalid/expired tokens).
    if (res.status === 403) {
      const raw = await res.text();
      let hint = "";
      try {
        const json =
          raw.length > 0
            ? (JSON.parse(raw) as { error?: { message?: string } })
            : null;
        const msg = json?.error?.message ?? "";
        if (msg) hint = ` — ${msg}`;
      } catch {
        if (raw.length > 0 && raw.length < 200) hint = ` — ${raw}`;
      }
      throw new Error(
        `Spotify API 403 Forbidden for ${path}${hint}. Check Spotify Developer Dashboard (Extended Quota vs Development Mode, Feb 2026 catalog limits).`,
      );
    }

    const raw = await res.text();
    const text = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
    let message = `Spotify API error: ${res.status} ${path}`;
    try {
      const json =
        raw.length > 0
          ? (JSON.parse(raw) as {
              error?: { message?: string };
              error_description?: string;
            })
          : null;
      const detail = json?.error?.message ?? json?.error_description;
      if (detail) message += ` — ${detail}`;
      else if (text) message += ` — ${text}`;
    } catch {
      if (text) message += ` — ${text}`;
    }
    lastError = new Error(message);
    break;
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface SpotifySearchResponse {
  artists?: { items: SpotifyApi.ArtistObjectFull[] };
  albums?: { items: SpotifyApi.AlbumObjectSimplified[] };
  tracks?: { items: SpotifyApi.TrackObjectFull[] };
}

export async function searchSpotify(
  query: string,
  types: ("artist" | "album" | "track")[] = ["artist", "album", "track"],
  limit = 10,
): Promise<SpotifySearchResponse> {
  const type = types.join(",");
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyFetch<SpotifySearchResponse>("/search", {
    q: query,
    type,
    limit: String(safeLimit),
  });
}

export async function getArtist(
  spotifyId: string,
): Promise<SpotifyApi.ArtistObjectFull> {
  return spotifyFetch<SpotifyApi.ArtistObjectFull>(`/artists/${spotifyId}`);
}

export async function getArtistAlbums(
  spotifyId: string,
  limit = 10,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  // Spotify client-credentials catalog enforces a maximum of 10 for this endpoint.
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyFetch(`/artists/${spotifyId}/albums`, {
    limit: String(safeLimit),
    include_groups: "album,single",
  });
}

export async function getAlbum(
  spotifyId: string,
): Promise<SpotifyApi.AlbumObjectFull> {
  return spotifyFetch<SpotifyApi.AlbumObjectFull>(`/albums/${spotifyId}`);
}

/** GET /albums/{id} per id — bulk GET /albums?ids= returns 403 on Spotify Development Mode (Feb 2026). */
export async function getAlbums(
  spotifyIds: string[],
): Promise<SpotifyApi.AlbumObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.AlbumObjectFull[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      out.push(await getAlbum(unique[i]!));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}

export async function getAlbumTracks(
  spotifyId: string,
  limit = 50,
  offset = 0,
): Promise<SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>> {
  return spotifyFetch(`/albums/${spotifyId}/tracks`, {
    limit: String(limit),
    offset: String(offset),
  });
}

export async function getTrack(
  spotifyId: string,
): Promise<SpotifyApi.TrackObjectFull> {
  return spotifyFetch<SpotifyApi.TrackObjectFull>(`/tracks/${spotifyId}`);
}

/** GET /tracks/{id} per id — bulk GET /tracks?ids= returns 403 on Spotify Development Mode (Feb 2026). */
export async function getTracks(
  spotifyIds: string[],
): Promise<SpotifyApi.TrackObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.TrackObjectFull[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      out.push(await getTrack(unique[i]!));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}

/** GET /artists/{id} per id — bulk GET /artists?ids= returns 403 on Spotify Development Mode (Feb 2026). */
export async function getArtists(
  spotifyIds: string[],
): Promise<SpotifyApi.ArtistObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.ArtistObjectFull[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      out.push(await getArtist(unique[i]!));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}
