import { logPerf } from "@/lib/profiling";
import {
  isSpotifyCatalogAllowedForLastfmImport,
  isSpotifyIntegrationEnabled,
  SpotifyIntegrationDisabledError,
} from "@/lib/spotify-integration-enabled";

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

/**
 * Spotify batch endpoints expect `ids=id1,id2` with literal commas.
 * `URLSearchParams` encodes commas as %2C, so Spotify receives one malformed id and returns nulls.
 */
function setQueryParamsPreservingIdCommas(
  url: URL,
  params: Record<string, string>,
): void {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (key === "ids") {
      const idList = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      parts.push(
        `${encodeURIComponent(key)}=${idList.map((id) => encodeURIComponent(id)).join(",")}`,
      );
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  url.search = parts.join("&");
}

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0]!;
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return AbortSignal.any(signals);
  }
  return signals[0]!;
}

function withTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const external = init.signal;
  const signals = external
    ? [external, controller.signal]
    : [controller.signal];
  const merged = mergeSignals(signals);
  return fetch(url, { ...init, signal: merged }).finally(() => {
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
  options?: {
    signal?: AbortSignal;
    /**
     * Explicit opt-in for this request when UI integration is off (documents intent; same effect as
     * having LASTFM_API_KEY set for server-side mapping — see `isSpotifyCatalogAllowedForLastfmImport`).
     */
    allowLastfmMapping?: boolean;
    /** Client-credentials calls when UI integration is off (e.g. cron metadata backfill). */
    allowClientCredentials?: boolean;
  },
): Promise<T> {
  if (
    !isSpotifyIntegrationEnabled() &&
    !options?.allowLastfmMapping &&
    !options?.allowClientCredentials &&
    !isSpotifyCatalogAllowedForLastfmImport()
  ) {
    throw new SpotifyIntegrationDisabledError();
  }

  const start = performance.now();
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  if (params) {
    setQueryParamsPreservingIdCommas(url, params);
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
        signal: options?.signal,
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (res.ok) {
      const data = (await res.json()) as T;
      logPerf("spotify", path, performance.now() - start, {
        path: path.slice(0, 100),
      });
      return data;
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

    // 403: refreshing the token does not help — fail fast so callers (e.g. getArtists) can fall back to single-id requests.
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
        `Spotify API 403 Forbidden for ${path}${hint}. Check Spotify Developer Dashboard (app status, Web API quota, Development Mode limits).`,
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
  opts?: { signal?: AbortSignal; allowLastfmMapping?: boolean },
): Promise<SpotifySearchResponse> {
  const type = types.join(",");
  const safeLimit = Math.min(Math.max(limit, 1), 10);
  return spotifyFetch<SpotifySearchResponse>(
    "/search",
    {
      q: query,
      type,
      limit: String(safeLimit),
    },
    {
      signal: opts?.signal,
      allowLastfmMapping: opts?.allowLastfmMapping,
    },
  );
}

export async function getArtist(
  spotifyId: string,
  opts?: { allowClientCredentials?: boolean; allowLastfmMapping?: boolean },
): Promise<SpotifyApi.ArtistObjectFull> {
  return spotifyFetch<SpotifyApi.ArtistObjectFull>(
    `/artists/${spotifyId}`,
    undefined,
    {
      allowClientCredentials: opts?.allowClientCredentials,
      allowLastfmMapping: opts?.allowLastfmMapping,
    },
  );
}

export async function getArtistAlbums(
  spotifyId: string,
  limit = 20,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  return spotifyFetch(`/artists/${spotifyId}/albums`, {
    limit: String(limit),
    include_groups: "album,single",
  });
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

/** Spotify limit: 20 albums per request. Chunks and merges. Falls back to single getAlbum() if batch returns 403. */
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
    try {
      const data = (await spotifyFetch<{
        albums: (SpotifyApi.AlbumObjectFull | null)[];
      }>("/albums", { ids })) as {
        albums: (SpotifyApi.AlbumObjectFull | null)[];
      };
      const resolved = (data.albums ?? []).filter(
        (a): a is SpotifyApi.AlbumObjectFull => a != null,
      );
      out.push(...resolved);
    } catch (err) {
      if (err instanceof Error && err.message.includes("403")) {
        // Fallback: fetch each album individually when batch endpoint is restricted.
        for (const id of chunk) {
          try {
            const a = await getAlbum(id);
            out.push(a);
          } catch {
            // skip failed single fetch
          }
          // Small delay to avoid hammering the API.
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      } else {
        throw err;
      }
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
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull> {
  return spotifyFetch<SpotifyApi.TrackObjectFull>(
    `/tracks/${spotifyId}`,
    undefined,
    {
      allowLastfmMapping: opts?.allowLastfmMapping,
    },
  );
}

/** Spotify limit: 50 tracks per request. Chunks and merges. Falls back to single getTrack() if batch returns 403. */
export async function getTracks(
  spotifyIds: string[],
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const CHUNK = 50;
  const out: SpotifyApi.TrackObjectFull[] = [];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const ids = chunk.join(",");
    try {
      const data = (await spotifyFetch<{
        tracks: (SpotifyApi.TrackObjectFull | null)[];
      }>(
        `/tracks`,
        { ids },
        { allowLastfmMapping: opts?.allowLastfmMapping },
      )) as {
        tracks: (SpotifyApi.TrackObjectFull | null)[];
      };
      const resolved = (data.tracks ?? []).filter(
        (t): t is SpotifyApi.TrackObjectFull => t != null,
      );
      out.push(...resolved);
    } catch (err) {
      if (err instanceof Error && err.message.includes("403")) {
        for (const id of chunk) {
          try {
            const t = await getTrack(id, opts);
            out.push(t);
          } catch {
            // skip failed single fetch
          }
          await new Promise((r) => setTimeout(r, 80));
        }
      } else {
        throw err;
      }
    }
  }
  return out;
}

/**
 * Resolves multiple artists using only GET /artists/{id} (one request per id).
 * The bulk ?ids= endpoint is not used — some Spotify apps return 403 on batch catalog reads while single-artist works.
 */
export async function getArtists(
  spotifyIds: string[],
  opts?: { allowClientCredentials?: boolean; allowLastfmMapping?: boolean },
): Promise<SpotifyApi.ArtistObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.ArtistObjectFull[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      out.push(await getArtist(unique[i]!, opts));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}
