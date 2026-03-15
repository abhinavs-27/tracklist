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
        headers: { Authorization: `Bearer ${token}` },
      },
      DEFAULT_TIMEOUT_MS,
    );

    console.log({ res });

    if (res.ok) {
      return res.json() as Promise<T>;
    }

    // Handle rate limiting with simple bounded backoff.
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : 1;
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? Math.min(Math.max(retryAfterSeconds, 1), 10) * 1000
        : 1000;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      lastError = new Error(`Spotify API rate limited for ${path}`);
      continue;
    }

    // If the token is invalid/expired earlier than expected, clear cache and retry once.
    if (res.status === 401) {
      cachedAccessToken = null;
      tokenExpiresAt = 0;
      lastError = new Error(`Spotify API unauthorized for ${path}`);
      continue;
    }

    const text = await res.text();
    lastError = new Error(`Spotify API error: ${res.status} ${path} ${text}`);
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
  limit = 20,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  return spotifyFetch(`/artists/${spotifyId}/albums`, { limit: String(limit) });
}

export async function getArtistTopTracks(
  spotifyId: string,
  market = "US",
): Promise<{ tracks: SpotifyApi.TrackObjectFull[] }> {
  return spotifyFetch(`/artists/${spotifyId}/top-tracks`, { market });
}

export async function getAlbum(
  spotifyId: string,
): Promise<SpotifyApi.AlbumObjectFull> {
  return spotifyFetch<SpotifyApi.AlbumObjectFull>(`/albums/${spotifyId}`);
}

/** Spotify limit: 20 albums per request. Chunks and merges. */
export async function getAlbums(
  spotifyIds: string[],
): Promise<SpotifyApi.AlbumObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const CHUNK = 20;
  const out: SpotifyApi.AlbumObjectFull[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const ids = chunk.join(",");
    const data = (await spotifyFetch<{ albums: (SpotifyApi.AlbumObjectFull | null)[] }>(
      "/albums",
      { ids },
    )) as { albums: (SpotifyApi.AlbumObjectFull | null)[] };
    const resolved = (data.albums ?? []).filter(
      (a): a is SpotifyApi.AlbumObjectFull => a != null,
    );
    out.push(...resolved);
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

/** Spotify limit: 50 tracks per request. Chunks and merges. */
export async function getTracks(
  spotifyIds: string[],
): Promise<SpotifyApi.TrackObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const CHUNK = 50;
  const out: SpotifyApi.TrackObjectFull[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const ids = chunk.join(",");
    const data = (await spotifyFetch<{ tracks: (SpotifyApi.TrackObjectFull | null)[] }>(
      "/tracks",
      { ids },
    )) as { tracks: (SpotifyApi.TrackObjectFull | null)[] };
    const resolved = (data.tracks ?? []).filter(
      (t): t is SpotifyApi.TrackObjectFull => t != null,
    );
    out.push(...resolved);
  }
  return out;
}

/** Spotify limit: 50 artists per request. Chunks and merges. */
export async function getArtists(
  spotifyIds: string[],
): Promise<SpotifyApi.ArtistObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const CHUNK = 50;
  const out: SpotifyApi.ArtistObjectFull[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const ids = chunk.join(",");
    const data = (await spotifyFetch<{ artists: (SpotifyApi.ArtistObjectFull | null)[] }>(
      "/artists",
      { ids },
    )) as { artists: (SpotifyApi.ArtistObjectFull | null)[] };
    const resolved = (data.artists ?? []).filter(
      (a): a is SpotifyApi.ArtistObjectFull => a != null,
    );
    out.push(...resolved);
  }
  return out;
}
