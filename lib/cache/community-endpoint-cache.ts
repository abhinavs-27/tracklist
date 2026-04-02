import Redis from "ioredis";

/**
 * Server-side cache for heavy community API responses (Redis when REDIS_URL is set,
 * otherwise in-memory with TTL). Keys: endpoint + community_id + param segments.
 */

const REDIS_KEY_PREFIX = "tracklist:community:api:v1:";
const MEMORY_MAX_ENTRIES = 2000;

/** Default TTL (seconds): middle of 5–15 minute window. */
export const COMMUNITY_API_CACHE_TTL_SEC = 600;

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

function redisKey(logicalKey: string): string {
  return `${REDIS_KEY_PREFIX}${logicalKey}`;
}

const memoryStore = new Map<
  string,
  { payload: string; expiresAt: number }
>();

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Stable cache key: `comm:{endpoint}:{communityId}[:part...]`
 * Include viewer-specific segments (e.g. user id for match / charts).
 */
export function communityEndpointCacheKey(
  endpoint: "insights" | "leaderboard" | "match" | "charts",
  communityId: string,
  ...parts: (string | null | undefined)[]
): string {
  const segs = parts.filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return `comm:${endpoint}:${communityId}:${segs.join(":")}`;
}

async function readMemory<T>(logicalKey: string): Promise<T | undefined> {
  const row = memoryStore.get(logicalKey);
  if (!row) return undefined;
  if (Date.now() >= row.expiresAt) {
    memoryStore.delete(logicalKey);
    return undefined;
  }
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    memoryStore.delete(logicalKey);
    return undefined;
  }
}

async function readRedis<T>(logicalKey: string): Promise<T | undefined> {
  const r = getRedis();
  if (!r) return undefined;
  try {
    const raw = await r.get(redisKey(logicalKey));
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeMemory(logicalKey: string, value: unknown, ttlSec: number): void {
  if (memoryStore.size >= MEMORY_MAX_ENTRIES) {
    const first = memoryStore.keys().next().value;
    if (first) memoryStore.delete(first);
  }
  memoryStore.set(logicalKey, {
    payload: JSON.stringify(value),
    expiresAt: Date.now() + ttlSec * 1000,
  });
}

async function writeRedis(
  logicalKey: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    const ex = Math.max(60, ttlSec);
    await r.set(redisKey(logicalKey), JSON.stringify(value), "EX", ex);
  } catch {
    /* ignore */
  }
}

export type CommunityApiCacheOptions<T> = {
  /** When false, the value is returned but not stored (e.g. skip caching null chart misses). */
  cacheWhen?: (value: T) => boolean;
};

/**
 * Returns cached value or runs `fetcher`, then stores result for `ttlSec` when `cacheWhen` passes.
 * Single-flight per key to avoid duplicate heavy work under load.
 */
export async function getOrSetCommunityApiCache<T>(
  logicalKey: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
  options?: CommunityApiCacheOptions<T>,
): Promise<T> {
  const fromRedis = await readRedis<T>(logicalKey);
  if (fromRedis !== undefined) return fromRedis;

  const fromMem = await readMemory<T>(logicalKey);
  if (fromMem !== undefined) return fromMem;

  const existing = inFlight.get(logicalKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = (async () => {
    const value = await fetcher();
    const shouldCache = options?.cacheWhen ? options.cacheWhen(value) : true;
    if (shouldCache) {
      await writeRedis(logicalKey, value, ttlSec);
      writeMemory(logicalKey, value, ttlSec);
    }
    return value;
  })();

  inFlight.set(logicalKey, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(logicalKey);
  }
}
