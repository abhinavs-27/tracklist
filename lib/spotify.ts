import { logPerf } from "@/lib/profiling";

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

/**
 * Set SPOTIFY_DEBUG=1 to log each Web API call (path, status, ms) to server stdout.
 * On non-OK responses, logs the full response body (and content-type) so you can see Spotify's error JSON.
 */
function spotifyDebugEnabled(): boolean {
  const v = process.env.SPOTIFY_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const SPOTIFY_ERROR_BODY_MAX_LOG = 24_000;

function spotifyDebugLogErrorResponse(
  safePath: string,
  status: number,
  elapsedMs: number,
  attempt: number,
  res: Response,
  body: string,
): void {
  if (!spotifyDebugEnabled()) return;
  const truncated =
    body.length > SPOTIFY_ERROR_BODY_MAX_LOG
      ? `${body.slice(0, SPOTIFY_ERROR_BODY_MAX_LOG)}…`
      : body;
  spotifyDebugLog(
    `GET ${safePath} → ${status} ${elapsedMs}ms attempt=${attempt} (error body)`,
    {
      contentType: res.headers.get("content-type"),
      body: truncated,
    },
  );
}

function spotifyDebugLog(line: string, extra?: Record<string, unknown>): void {
  if (!spotifyDebugEnabled()) return;
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[spotify] ${line}`, extra);
  } else {
    console.log(`[spotify] ${line}`);
  }
}

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

  const tokenStart = performance.now();
  spotifyDebugLog("POST /api/token (client credentials grant)");

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
    spotifyDebugLog(`token → ${res.status} ${Math.round(performance.now() - tokenStart)}ms`, {
      error: text.slice(0, 200),
    });
    throw new Error(`Spotify token error: ${res.status} ${text}`);
  }

  spotifyDebugLog(
    `token → ${res.status} ${Math.round(performance.now() - tokenStart)}ms (cached until refresh)`,
  );

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
    /** @deprecated Reserved for callers; client-credentials catalog is always allowed when credentials exist. */
    allowLastfmMapping?: boolean;
    allowClientCredentials?: boolean;
  },
): Promise<T> {
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

    const elapsed = Math.round(performance.now() - start);
    const pathWithQuery = `${url.pathname}${url.search}`;
    const safePath =
      pathWithQuery.length > 220
        ? `${pathWithQuery.slice(0, 217)}…`
        : pathWithQuery;

    if (res.ok) {
      spotifyDebugLog(
        `GET ${safePath} → ${res.status} ${elapsed}ms attempt=${attempt + 1}`,
      );
      const data = (await res.json()) as T;
      logPerf("spotify", path, performance.now() - start, {
        path: path.slice(0, 100),
      });
      return data;
    }

    const errorBody = await res.text();
    spotifyDebugLogErrorResponse(
      safePath,
      res.status,
      elapsed,
      attempt + 1,
      res,
      errorBody,
    );

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

    // 403: wrong app policy / Dev Mode restriction — not a stale token (use 401 for that).
    if (res.status === 403) {
      let hint = "";
      try {
        const json =
          errorBody.length > 0
            ? (JSON.parse(errorBody) as { error?: { message?: string } })
            : null;
        const msg = json?.error?.message ?? "";
        if (msg) hint = ` — ${msg}`;
      } catch {
        if (errorBody.length > 0 && errorBody.length < 200) hint = ` — ${errorBody}`;
      }
      throw new Error(
        `Spotify API 403 Forbidden for ${path}${hint}. Check Spotify Developer Dashboard (app status, Web API quota, Development Mode limits).`,
      );
    }

    const raw = errorBody;
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

export async function getAlbum(
  spotifyId: string,
): Promise<SpotifyApi.AlbumObjectFull> {
  return spotifyFetch<SpotifyApi.AlbumObjectFull>(`/albums/${spotifyId}`);
}

/**
 * Resolves albums via GET /albums/{id} only.
 * Bulk GET /albums?ids= is removed for Spotify Development Mode apps (Feb 2026); batch calls return 403.
 */
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

/**
 * Resolves tracks via GET /tracks/{id} only.
 * Bulk GET /tracks?ids= is removed for Spotify Development Mode apps (Feb 2026); batch calls return 403.
 */
export async function getTracks(
  spotifyIds: string[],
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull[]> {
  const unique = [...new Set(spotifyIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const out: SpotifyApi.TrackObjectFull[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      out.push(await getTrack(unique[i]!, opts));
    } catch {
      /* invalid id or API error */
    }
  }
  return out;
}

/**
 * Resolves multiple artists using only GET /artists/{id} (one request per id).
 * Bulk GET /artists?ids= is removed for Spotify Development Mode apps (Feb 2026); batch calls return 403.
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
