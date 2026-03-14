import "server-only";

import {
  getTrendingEntities,
  getRisingArtists,
  getHiddenGems,
  type TrendingEntity,
  type RisingArtist,
  type HiddenGem,
} from "@/lib/queries";

const TTL_MS = 10 * 60 * 1000; // 10 minutes

type CacheEntry<T> = { data: T; expiresAt: number };

const trendingCache = new Map<string, CacheEntry<TrendingEntity[]>>();
const risingCache = new Map<string, CacheEntry<RisingArtist[]>>();
const hiddenCache = new Map<string, CacheEntry<HiddenGem[]>>();

function prune<T>(map: Map<string, CacheEntry<T>>) {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (v.expiresAt <= now) map.delete(k);
  }
}

export async function getTrendingEntitiesCached(
  limit = 20,
): Promise<TrendingEntity[]> {
  const key = `trending:${limit}`;
  const now = Date.now();
  const hit = trendingCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  prune(trendingCache);
  const data = await getTrendingEntities(limit);
  trendingCache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}

export async function getRisingArtistsCached(
  limit = 20,
  windowDays = 7,
): Promise<RisingArtist[]> {
  const key = `rising:${limit}:${windowDays}`;
  const now = Date.now();
  const hit = risingCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  prune(risingCache);
  const data = await getRisingArtists(limit, windowDays);
  risingCache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}

export async function getHiddenGemsCached(
  limit = 20,
  minRating = 4,
  maxListens = 50,
): Promise<HiddenGem[]> {
  const key = `hidden:${limit}:${minRating}:${maxListens}`;
  const now = Date.now();
  const hit = hiddenCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  prune(hiddenCache);
  const data = await getHiddenGems(limit, minRating, maxListens);
  hiddenCache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}
