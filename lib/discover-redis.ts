import { getSharedRedis } from "./redis-client";

/** Must match keys used in [`lib/discover-cache.ts`](lib/discover-cache.ts). */
export const DISCOVER_CACHE_REDIS_PREFIX = "tracklist:discover:v1:";

const EMPTY_TTL_SEC = 60;

function redisKey(logicalKey: string): string {
  return `${DISCOVER_CACHE_REDIS_PREFIX}${logicalKey}`;
}

export async function readDiscoverCache<T>(
  logicalKey: string,
): Promise<T | undefined> {
  const r = getSharedRedis();
  if (!r) return undefined;
  try {
    const raw = await r.get(redisKey(logicalKey));
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function writeDiscoverCache(
  logicalKey: string,
  value: unknown,
  ttlSec: number,
): Promise<void> {
  const r = getSharedRedis();
  if (!r) return;
  try {
    const ex = Math.max(EMPTY_TTL_SEC, ttlSec);
    await r.set(redisKey(logicalKey), JSON.stringify(value), "EX", ex);
  } catch {
    /* ignore */
  }
}
