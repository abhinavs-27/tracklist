import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { readDiscoverCache, writeDiscoverCache } from "@/lib/discover-redis";
import { logPerf } from "@/lib/profiling";
import {
  getTrendingEntities,
  getRisingArtists,
  getHiddenGems,
} from "@/lib/queries";
import { getTrendingEntitiesFromPrecomputed } from "@/lib/precomputed-cache-read";
import type { TrendingEntity, RisingArtist, HiddenGem } from "@/types";

const TTL_MS = 15 * 60 * 1000; // 15 min (server-side cache; MVs refreshed every 5–15 min)
/** Avoid caching “no trending” for 15m after MV/cron starts returning rows. */
const EMPTY_TTL_MS = 60 * 1000;

const TTL_SEC = Math.floor(TTL_MS / 1000);
const EMPTY_TTL_SEC = Math.floor(EMPTY_TTL_MS / 1000);

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

/** Read from MV first; fallback to live RPC. Never throws – returns [] on failure. */
async function getTrendingFromMvOrLive(limit: number): Promise<TrendingEntity[]> {
  const start = performance.now();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_trending_entities_from_mv", {
      p_limit: limit,
    });
    const ms = performance.now() - start;
    if (!error && data?.length) {
      logPerf("mv_hit", "trending", ms, { limit });
      return (data as { entity_id: string; entity_type: string; listen_count: number }[]).map(
        (r) => ({
          entity_id: r.entity_id,
          entity_type: r.entity_type ?? "song",
          listen_count: Number(r.listen_count) || 0,
        }),
      );
    }
    logPerf("mv_miss", "trending", ms, { limit });
  } catch {
    logPerf("mv_miss", "trending", performance.now() - start, { limit });
  }
  return getTrendingEntities(limit);
}

/** Read from MV first (7-day window only); fallback to live RPC. Never throws. */
async function getRisingFromMvOrLive(limit: number, windowDays: number): Promise<RisingArtist[]> {
  if (windowDays !== 7) return getRisingArtists(limit, windowDays);
  const start = performance.now();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_rising_artists_from_mv", { p_limit: limit });
    const ms = performance.now() - start;
    if (!error && data?.length) {
      logPerf("mv_hit", "rising_artists", ms, { limit });
      return (data as { artist_id: string; name: string; avatar_url: string | null; growth: number }[]).map(
        (r) => ({
          artist_id: r.artist_id,
          name: r.name ?? "",
          avatar_url: r.avatar_url ?? null,
          growth: Number(r.growth) || 0,
        }),
      );
    }
    logPerf("mv_miss", "rising_artists", ms, { limit });
  } catch {
    logPerf("mv_miss", "rising_artists", performance.now() - start, { limit });
  }
  return getRisingArtists(limit, windowDays);
}

/** Read from MV first (minRating=4, maxListens=50 only); fallback to live RPC; then relaxed thresholds if still empty. */
async function getHiddenFromMvOrLive(
  limit: number,
  minRating: number,
  maxListens: number,
): Promise<HiddenGem[]> {
  if (minRating === 4 && maxListens === 50) {
    const start = performance.now();
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.rpc("get_hidden_gems_from_mv", { p_limit: limit });
      const ms = performance.now() - start;
      if (!error && data?.length) {
        logPerf("mv_hit", "hidden_gems", ms, { limit });
        return (data as { entity_id: string; entity_type: string; avg_rating: number; listen_count: number }[]).map(
          (r) => ({
            entity_id: r.entity_id,
            entity_type: r.entity_type ?? "song",
            avg_rating: Number(r.avg_rating) || 0,
            listen_count: Number(r.listen_count) || 0,
          }),
        );
      }
      logPerf("mv_miss", "hidden_gems", ms, { limit });
    } catch {
      logPerf("mv_miss", "hidden_gems", performance.now() - start, { limit });
    }
  }

  let rows = await getHiddenGems(limit, minRating, maxListens);
  if (rows.length > 0) return rows;

  /** Still empty: looser bar when few reviews exist (each entity still needs ≥1 review). */
  if (minRating > 3.5 || maxListens < 100) {
    rows = await getHiddenGems(limit, 3.5, 150);
  }
  return rows;
}

export async function getTrendingEntitiesCached(
  limit = 20,
): Promise<TrendingEntity[]> {
  const key = `trending:${limit}`;
  const now = Date.now();
  const hit = trendingCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  prune(trendingCache);

  const fromRedis = await readDiscoverCache<TrendingEntity[]>(key);
  if (fromRedis !== undefined) {
    trendingCache.set(key, { data: fromRedis, expiresAt: now + TTL_MS });
    return fromRedis;
  }

  const fromDaily = await getTrendingEntitiesFromPrecomputed(limit);
  if (fromDaily && fromDaily.length > 0) {
    trendingCache.set(key, {
      data: fromDaily,
      expiresAt: now + TTL_MS,
    });
    void writeDiscoverCache(key, fromDaily, TTL_SEC);
    return fromDaily;
  }

  const data = await getTrendingFromMvOrLive(limit);
  const ttl = data.length === 0 ? EMPTY_TTL_MS : TTL_MS;
  trendingCache.set(key, { data, expiresAt: now + ttl });
  void writeDiscoverCache(
    key,
    data,
    data.length === 0 ? EMPTY_TTL_SEC : TTL_SEC,
  );
  return data;
}

/** Used only by cron to populate `trending_cache` (bypasses memory + DB snapshot). */
export async function getTrendingEntitiesForPrecompute(
  limit = 50,
): Promise<TrendingEntity[]> {
  return getTrendingFromMvOrLive(limit);
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

  const fromRedis = await readDiscoverCache<RisingArtist[]>(key);
  if (fromRedis !== undefined) {
    risingCache.set(key, { data: fromRedis, expiresAt: now + TTL_MS });
    return fromRedis;
  }

  const data = await getRisingFromMvOrLive(limit, windowDays);
  risingCache.set(key, { data, expiresAt: now + TTL_MS });
  void writeDiscoverCache(key, data, TTL_SEC);
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

  const fromRedis = await readDiscoverCache<HiddenGem[]>(key);
  if (fromRedis !== undefined) {
    hiddenCache.set(key, { data: fromRedis, expiresAt: now + TTL_MS });
    return fromRedis;
  }

  const data = await getHiddenFromMvOrLive(limit, minRating, maxListens);
  hiddenCache.set(key, { data, expiresAt: now + TTL_MS });
  void writeDiscoverCache(key, data, TTL_SEC);
  return data;
}
