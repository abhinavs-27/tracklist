/**
 * @tracklist/spotify-client — shared Spotify gateway (Next + Express).
 * Redis-backed Bottleneck, circuit breaker, SWR cache, metrics.
 */

import Bottleneck from "bottleneck";
import Redis from "ioredis";

export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 3;
const MEMORY_CACHE_MAX = 5000;
const FAIL_FAST_ON_429 = process.env.SPOTIFY_FAIL_FAST_ON_429 !== "0";

const TTL_ARTIST_ALBUM_TRACK_SEC = 86400 * 7;
const TTL_SEARCH_SEC = 3600;
const TTL_ALBUM_TRACKS_PAGE_SEC = 86400;

const CIRCUIT_REDIS_KEY = "spotify:circuit:blocked-until";

/** Max IDs per batch helper (sequential Spotify calls). */
export const MAX_SPOTIFY_ITEMS = 50;

export function enforceSpotifyBatchLimit(items: unknown[], label = "batch"): void {
  if (items.length > MAX_SPOTIFY_ITEMS) {
    throw new Error(
      `Exceeded safe Spotify request limit (${label}: ${items.length} > ${MAX_SPOTIFY_ITEMS})`,
    );
  }
}

/** Thrown when Spotify returns HTTP 429 — callers may decide whether to retry. */
export class SpotifyRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "SpotifyRateLimitError";
  }
}

type SpotifyMetrics = {
  apiCalls: number;
  cacheHits: number;
  cacheMisses: number;
  staleHits: number;
  rate429Hits: number;
  dedupeHits: number;
};

const metrics: SpotifyMetrics = {
  apiCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  staleHits: 0,
  rate429Hits: 0,
  dedupeHits: 0,
};

let inMemoryCircuitUntil = 0;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Self-throttle to stay under Spotify Web API limits. Tune via env without code changes.
 * Defaults are slightly conservative vs historical 200ms / 30·min⁻¹ to reduce 429s under burst load.
 */
const SPOTIFY_MIN_TIME_MS = parsePositiveIntEnv("SPOTIFY_MIN_TIME_MS", 300);
const SPOTIFY_RESERVOIR_PER_MIN = parsePositiveIntEnv(
  "SPOTIFY_RESERVOIR_PER_MIN",
  24,
);

/** Cross-process when `REDIS_URL` is set; otherwise per-process. */
export const spotifyLimiter = (() => {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new Bottleneck({
      datastore: "ioredis",
      clearDatastore: false,
      id: "spotify-catalog-limiter",
      clientOptions: url,
      maxConcurrent: 1,
      minTime: SPOTIFY_MIN_TIME_MS,
      reservoir: SPOTIFY_RESERVOIR_PER_MIN,
      reservoirRefreshAmount: SPOTIFY_RESERVOIR_PER_MIN,
      reservoirRefreshInterval: 60 * 1000,
    });
  }
  return new Bottleneck({
    maxConcurrent: 1,
    minTime: SPOTIFY_MIN_TIME_MS,
    reservoir: SPOTIFY_RESERVOIR_PER_MIN,
    reservoirRefreshAmount: SPOTIFY_RESERVOIR_PER_MIN,
    reservoirRefreshInterval: 60 * 1000,
  });
})();

let redisClient: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableReadyCheck: true,
    });
  } catch {
    redisClient = null;
  }
  return redisClient;
}

const memoryCache = new Map<
  string,
  { payload: string; expiresAt: number; redisTtlSec: number }
>();

type CachedEnvelope<T = unknown> = {
  data: T;
  /** Logical freshness boundary (soft TTL). */
  expiresAt: number;
};

function redisKey(cacheKey: string): string {
  return `spotify:cc:${cacheKey}`;
}

function maybeLogSpotifyHealth(): void {
  const total = metrics.cacheHits + metrics.cacheMisses + metrics.staleHits;
  const denom = total > 0 ? total : 1;
  const hitRate = metrics.cacheHits / denom;
  const warn429 = metrics.rate429Hits > 10;
  /** Unique search URLs during Last.fm enrichment are almost all misses — not an outage. */
  const warnHit =
    total > 30 &&
    hitRate < 0.7 &&
    (metrics.rate429Hits > 0 || total > 400);
  if (warn429 || warnHit) {
    console.warn("[spotify-client] Spotify health degraded", {
      ...metrics,
      hitRate: Math.round(hitRate * 1000) / 1000,
    });
  }
}

async function getCached(
  key: string,
): Promise<{ data: unknown; isExpired: boolean } | null> {
  const r = getRedis();
  if (r) {
    try {
      const raw = await r.get(redisKey(key));
      if (!raw) {
        metrics.cacheMisses++;
        maybeLogSpotifyHealth();
        return null;
      }
      const parsed = JSON.parse(raw) as CachedEnvelope;
      const isExpired = Date.now() > parsed.expiresAt;
      if (isExpired) {
        metrics.staleHits++;
      } else {
        metrics.cacheHits++;
      }
      maybeLogSpotifyHealth();
      return { data: parsed.data, isExpired };
    } catch {
      metrics.cacheMisses++;
    }
  }
  const mem = memoryCache.get(key);
  if (!mem) {
    metrics.cacheMisses++;
    maybeLogSpotifyHealth();
    return null;
  }
  try {
    const parsed = JSON.parse(mem.payload) as CachedEnvelope;
    const isExpired = Date.now() > parsed.expiresAt;
    if (isExpired) metrics.staleHits++;
    else metrics.cacheHits++;
    maybeLogSpotifyHealth();
    return { data: parsed.data, isExpired };
  } catch {
    memoryCache.delete(key);
    metrics.cacheMisses++;
    return null;
  }
}

async function setCached(key: string, value: unknown, ttlSec: number): Promise<void> {
  const expiresAt = Date.now() + ttlSec * 1000;
  const envelope: CachedEnvelope = { data: value, expiresAt };
  const payload = JSON.stringify(envelope);
  const redisTtl = Math.max(ttlSec * 2, ttlSec + 60);
  const r = getRedis();
  if (r) {
    try {
      await r.set(redisKey(key), payload, "EX", redisTtl);
    } catch {
      /* memory only */
    }
  }
  if (memoryCache.size > MEMORY_CACHE_MAX) {
    const first = memoryCache.keys().next().value;
    if (first) memoryCache.delete(first);
  }
  memoryCache.set(key, {
    payload,
    expiresAt,
    redisTtlSec: redisTtl,
  });
}

const inFlight = new Map<string, Promise<unknown>>();
const revalidateInFlight = new Set<string>();

export async function withDedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    metrics.dedupeHits++;
    return existing as Promise<T>;
  }
  const promise = fn().finally(() => {
    inFlight.delete(key);
  }) as Promise<T>;
  inFlight.set(key, promise as Promise<unknown>);
  return promise;
}

export function getSpotifyClientMetrics(): Readonly<SpotifyMetrics> {
  return { ...metrics };
}

export function resetSpotifyClientMetrics(): void {
  metrics.apiCalls = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.staleHits = 0;
  metrics.rate429Hits = 0;
  metrics.dedupeHits = 0;
}

export function checkSpotifyEnabled(): void {
  if (process.env.SPOTIFY_DISABLED === "true") {
    throw new Error("Spotify API temporarily disabled");
  }
}

export async function checkCircuitBreaker(): Promise<void> {
  const r = getRedis();
  if (r) {
    try {
      const v = await r.get(CIRCUIT_REDIS_KEY);
      if (v) {
        const until = Number.parseInt(v, 10);
        if (Number.isFinite(until) && Date.now() < until) {
          throw new Error(
            "Spotify temporarily rate-limited (circuit breaker active)",
          );
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("circuit breaker")) {
        throw e;
      }
    }
    return;
  }
  if (Date.now() < inMemoryCircuitUntil) {
    throw new Error(
      "Spotify temporarily rate-limited (circuit breaker active)",
    );
  }
}

async function tripCircuitBreaker(retryAfterSec: number): Promise<void> {
  const until = Date.now() + Math.min(300, Math.max(1, retryAfterSec)) * 1000;
  inMemoryCircuitUntil = Math.max(inMemoryCircuitUntil, until);
  const r = getRedis();
  if (r) {
    try {
      const ex = Math.min(600, Math.max(1, retryAfterSec * 2));
      await r.set(CIRCUIT_REDIS_KEY, String(until), "EX", ex);
    } catch {
      /* ignore */
    }
  }
}

export function setQueryParamsPreservingIdCommas(
  url: URL,
  params: Record<string, string>,
): void {
  const parts: string[] = [];
  for (const [k, value] of Object.entries(params)) {
    if (k === "ids") {
      const idList = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      parts.push(
        `${encodeURIComponent(k)}=${idList.map((id) => encodeURIComponent(id)).join(",")}`,
      );
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(value)}`);
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

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

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

function ttlForCatalogPath(path: string): number {
  if (path.startsWith("/search")) return TTL_SEARCH_SEC;
  if (path.includes("/tracks")) return TTL_ALBUM_TRACKS_PAGE_SEC;
  return TTL_ARTIST_ALBUM_TRACK_SEC;
}

function spotifyDebugEnabled(): boolean {
  const v = process.env.SPOTIFY_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function spotifyDebugLog(line: string, extra?: Record<string, unknown>): void {
  if (!spotifyDebugEnabled()) return;
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[spotify-client] ${line}`, extra);
  } else {
    console.log(`[spotify-client] ${line}`);
  }
}

async function fetchCatalogResponseWithRetry(
  url: string,
  path: string,
  signal: AbortSignal | undefined,
  retriesLeft: number,
): Promise<Response> {
  checkSpotifyEnabled();
  await checkCircuitBreaker();
  const token = await getClientCredentialsToken();
  metrics.apiCalls++;

  const res = await spotifyLimiter.schedule(() =>
    withTimeout(
      url,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal,
      },
      DEFAULT_TIMEOUT_MS,
    ),
  );

  if (res.status === 429) {
    metrics.rate429Hits++;
    maybeLogSpotifyHealth();
    const retryAfter = Number(res.headers.get("Retry-After") || 1);
    const retryAfterSec = Number.isFinite(retryAfter) ? retryAfter : 1;
    await tripCircuitBreaker(retryAfterSec);
    if (FAIL_FAST_ON_429) {
      const ra = Number.isFinite(retryAfter) ? retryAfter : null;
      throw new SpotifyRateLimitError(
        `Spotify API rate limited for ${path}`,
        ra,
      );
    }
    const waitMs = Math.min(
      120_000,
      Math.max(1000, retryAfterSec * 1000),
    );
    spotifyDebugLog(`429 — retry after ${waitMs}ms (${retriesLeft} left)`);
    if (retriesLeft <= 0) {
      const ra = Number.isFinite(retryAfter) ? retryAfter : null;
      throw new SpotifyRateLimitError(
        `Spotify API rate limited for ${path}`,
        ra,
      );
    }
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchCatalogResponseWithRetry(url, path, signal, retriesLeft - 1);
  }

  if (res.status === 401) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    if (retriesLeft <= 0) {
      const text = await res.text();
      throw new Error(`Spotify API unauthorized: ${text}`);
    }
    return fetchCatalogResponseWithRetry(url, path, signal, retriesLeft - 1);
  }

  if (!res.ok && retriesLeft > 0 && res.status >= 500) {
    await new Promise((r) => setTimeout(r, 500));
    return fetchCatalogResponseWithRetry(url, path, signal, retriesLeft - 1);
  }

  return res;
}

async function parseCatalogError(res: Response, path: string): Promise<never> {
  const errorBody = await res.text();
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
      if (errorBody.length > 0 && errorBody.length < 200)
        hint = ` — ${errorBody}`;
    }
    throw new Error(
      `Spotify API 403 Forbidden for ${path}${hint}. Check Spotify Developer Dashboard (app status, Web API quota, Development Mode limits).`,
    );
  }
  let message = `Spotify API error: ${res.status} ${path}`;
  try {
    const json =
      errorBody.length > 0
        ? (JSON.parse(errorBody) as {
            error?: { message?: string };
            error_description?: string;
          })
        : null;
    const detail = json?.error?.message ?? json?.error_description;
    if (detail) message += ` — ${detail}`;
    else if (errorBody) message += ` — ${errorBody.slice(0, 500)}`;
  } catch {
    if (errorBody) message += ` — ${errorBody.slice(0, 500)}`;
  }
  throw new Error(message);
}

async function fetchCatalogJsonNetwork<T>(
  url: URL,
  path: string,
  signal: AbortSignal | undefined,
): Promise<T> {
  const res = await fetchCatalogResponseWithRetry(
    url.toString(),
    path,
    signal,
    MAX_RETRIES,
  );
  if (!res.ok) {
    await parseCatalogError(res, path);
  }
  return (await res.json()) as T;
}

function revalidateInBackground(
  cacheKey: string,
  url: URL,
  path: string,
  ttlSec: number,
  signal: AbortSignal | undefined,
): void {
  const k = `revalidate:${cacheKey}`;
  if (revalidateInFlight.has(k)) return;
  revalidateInFlight.add(k);
  void (async () => {
    try {
      const data = await fetchCatalogJsonNetwork<unknown>(url, path, signal);
      await setCached(cacheKey, data, ttlSec);
    } catch (e) {
      spotifyDebugLog("SWR revalidate failed", { cacheKey, error: String(e) });
    } finally {
      revalidateInFlight.delete(k);
    }
  })();
}

/**
 * Client-credentials GET — cached (SWR), deduped, rate-limited.
 */
export async function catalogSpotifyFetchJson<T>(
  path: string,
  params?: Record<string, string>,
  options?: {
    signal?: AbortSignal;
    skipCache?: boolean;
  },
): Promise<T> {
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  if (params) {
    setQueryParamsPreservingIdCommas(url, params);
  }
  const cacheKey = `GET:${url.pathname}${url.search}`;
  const ttl = ttlForCatalogPath(path);

  return withDedupe(`cc:${cacheKey}`, async () => {
    if (!options?.skipCache) {
      const cached = await getCached(cacheKey);
      if (cached && !cached.isExpired) {
        return cached.data as T;
      }
      if (cached && cached.isExpired) {
        revalidateInBackground(
          cacheKey,
          url,
          path,
          ttl,
          options?.signal,
        );
        return cached.data as T;
      }
    }

    const data = await fetchCatalogJsonNetwork<T>(
      url,
      path,
      options?.signal,
    );
    if (!options?.skipCache) {
      await setCached(cacheKey, data, ttl);
    }
    return data;
  });
}

/**
 * User Bearer GET — rate-limited + deduped; no Redis cache.
 */
export async function bearerSpotifyFetchJson<T>(
  accessToken: string,
  path: string,
  params?: Record<string, string>,
  options?: { signal?: AbortSignal; retriesLeft?: number },
): Promise<T> {
  checkSpotifyEnabled();
  const retriesLeft = options?.retriesLeft ?? 3;
  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const dedupeKey = `Bearer:${accessToken.slice(0, 12)}:${url.pathname}${url.search}`;

  return withDedupe(dedupeKey, async () => {
    await checkCircuitBreaker();
    const res = await spotifyLimiter.schedule(() =>
      withTimeout(
        url.toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          signal: options?.signal,
        },
        DEFAULT_TIMEOUT_MS,
      ),
    );

    metrics.apiCalls++;

    if (res.status === 429) {
      metrics.rate429Hits++;
      maybeLogSpotifyHealth();
      const retryAfterSec = Number(res.headers.get("Retry-After") || 2);
      await tripCircuitBreaker(Number.isFinite(retryAfterSec) ? retryAfterSec : 2);
      if (FAIL_FAST_ON_429) {
        const ra = Number.parseInt(res.headers.get("Retry-After") || "1", 10);
        throw new SpotifyRateLimitError(
          `Spotify user API rate limited for ${path}`,
          Number.isFinite(ra) ? ra : null,
        );
      }
      if (retriesLeft <= 0) {
        const ra = Number.parseInt(res.headers.get("Retry-After") || "1", 10);
        throw new SpotifyRateLimitError(
          `Spotify user API rate limited for ${path}`,
          Number.isFinite(ra) ? ra : null,
        );
      }
      const waitMs = Math.min(
        120_000,
        Math.max(
          1000,
          (Number.isFinite(retryAfterSec) ? retryAfterSec : 2) * 1000,
        ),
      );
      await new Promise((r) => setTimeout(r, waitMs));
      return bearerSpotifyFetchJson<T>(accessToken, path, params, {
        ...options,
        retriesLeft: retriesLeft - 1,
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify user API error: ${res.status} ${path} ${text}`);
    }

    return (await res.json()) as T;
  });
}
