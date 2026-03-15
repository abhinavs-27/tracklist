import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logPerf } from "@/lib/profiling";
import {
  getTrendingEntities,
  getRisingArtists,
  getHiddenGems,
  type TrendingEntity,
  type RisingArtist,
  type HiddenGem,
} from "@/lib/queries";

const TTL_MS = 15 * 60 * 1000; // 15 min (server-side cache; MVs refreshed every 5–15 min)

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

/** Read from MV first (minRating=4, maxListens=50 only); fallback to live RPC. Never throws. */
async function getHiddenFromMvOrLive(
  limit: number,
  minRating: number,
  maxListens: number,
): Promise<HiddenGem[]> {
  if (minRating !== 4 || maxListens !== 50) return getHiddenGems(limit, minRating, maxListens);
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
  return getHiddenGems(limit, minRating, maxListens);
}

export async function getTrendingEntitiesCached(
  limit = 20,
): Promise<TrendingEntity[]> {
  const key = `trending:${limit}`;
  const now = Date.now();
  const hit = trendingCache.get(key);
  if (hit && hit.expiresAt > now) return hit.data;
  prune(trendingCache);
  const data = await getTrendingFromMvOrLive(limit);
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
  const data = await getRisingFromMvOrLive(limit, windowDays);
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
  const data = await getHiddenFromMvOrLive(limit, minRating, maxListens);
  hiddenCache.set(key, { data, expiresAt: now + TTL_MS });
  return data;
}
