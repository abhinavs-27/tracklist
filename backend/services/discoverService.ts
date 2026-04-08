import { getSupabase } from "../lib/supabase";
import { readDiscoverCache, writeDiscoverCache } from "../../lib/discover-redis";

const TTL_MS = 15 * 60 * 1000;
const EMPTY_TTL_MS = 60 * 1000;
const TTL_SEC = Math.floor(TTL_MS / 1000);
const EMPTY_TTL_SEC = Math.floor(EMPTY_TTL_MS / 1000);

type CacheEntry<T> = { data: T; expiresAt: number };

const trendingCache = new Map<string, CacheEntry<unknown[]>>();
const risingCache = new Map<string, CacheEntry<unknown[]>>();
const hiddenCache = new Map<string, CacheEntry<unknown[]>>();

function prune<T>(map: Map<string, CacheEntry<T>>) {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (v.expiresAt <= now) map.delete(k);
  }
}

export type TrendingEntity = {
  entity_id: string;
  entity_type: string;
  listen_count: number;
};

export type RisingArtist = {
  artist_id: string;
  name: string;
  avatar_url: string | null;
  growth: number;
};

export type HiddenGem = {
  entity_id: string;
  entity_type: string;
  avg_rating: number;
  listen_count: number;
};

async function getTrendingFromMvOrLive(limit: number): Promise<TrendingEntity[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_trending_entities_from_mv", {
      p_limit: limit,
    });
    if (!error && data?.length) {
      return (data as { entity_id: string; entity_type: string; listen_count: number }[]).map(
        (r) => ({
          entity_id: r.entity_id,
          entity_type: r.entity_type ?? "song",
          listen_count: Number(r.listen_count) || 0,
        }),
      );
    }
  } catch {
    /* fall through */
  }
  return getTrendingEntitiesLive(limit);
}

async function getTrendingEntitiesLive(limit: number): Promise<TrendingEntity[]> {
  try {
    const supabase = getSupabase();
    const capped = Math.min(Math.max(1, limit), 50);
    const { data, error } = await supabase.rpc("get_trending_entities", {
      p_limit: capped,
    });
    if (error) return [];
    return (data ?? []).map(
      (r: { entity_id: string; entity_type: string; listen_count: number }) => ({
        entity_id: r.entity_id,
        entity_type: r.entity_type ?? "song",
        listen_count: Number(r.listen_count) || 0,
      }),
    );
  } catch {
    return [];
  }
}

async function getRisingFromMvOrLive(
  limit: number,
  windowDays: number,
): Promise<RisingArtist[]> {
  if (windowDays !== 7) return getRisingArtistsLive(limit, windowDays);
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_rising_artists_from_mv", {
      p_limit: limit,
    });
    if (!error && data?.length) {
      return (data as { artist_id: string; name: string; avatar_url: string | null; growth: number }[]).map(
        (r) => ({
          artist_id: r.artist_id,
          name: r.name ?? "",
          avatar_url: r.avatar_url ?? null,
          growth: Number(r.growth) || 0,
        }),
      );
    }
  } catch {
    /* fall through */
  }
  return getRisingArtistsLive(limit, windowDays);
}

async function getRisingArtistsLive(
  limit: number,
  windowDays: number,
): Promise<RisingArtist[]> {
  try {
    const supabase = getSupabase();
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const cappedWindow = Math.min(Math.max(1, windowDays), 90);
    const { data, error } = await supabase.rpc("get_rising_artists", {
      p_limit: cappedLimit,
      p_window_days: cappedWindow,
    });
    if (error) return [];
    return (data ?? []).map(
      (r: {
        artist_id: string;
        name: string;
        avatar_url: string | null;
        growth: number;
      }) => ({
        artist_id: r.artist_id,
        name: r.name ?? "",
        avatar_url: r.avatar_url ?? null,
        growth: Number(r.growth) || 0,
      }),
    );
  } catch {
    return [];
  }
}

async function getHiddenFromMvOrLive(
  limit: number,
  minRating: number,
  maxListens: number,
): Promise<HiddenGem[]> {
  if (minRating !== 4 || maxListens !== 50) {
    return getHiddenGemsLive(limit, minRating, maxListens);
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("get_hidden_gems_from_mv", {
      p_limit: limit,
    });
    if (!error && data?.length) {
      return (data as { entity_id: string; entity_type: string; avg_rating: number; listen_count: number }[]).map(
        (r) => ({
          entity_id: r.entity_id,
          entity_type: r.entity_type ?? "song",
          avg_rating: Number(r.avg_rating) || 0,
          listen_count: Number(r.listen_count) || 0,
        }),
      );
    }
  } catch {
    /* fall through */
  }
  return getHiddenGemsLive(limit, minRating, maxListens);
}

async function getHiddenGemsLive(
  limit: number,
  minRating: number,
  maxListens: number,
): Promise<HiddenGem[]> {
  try {
    const supabase = getSupabase();
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const { data, error } = await supabase.rpc("get_hidden_gems", {
      p_limit: cappedLimit,
      p_min_rating: minRating,
      p_max_listens: maxListens,
    });
    if (error) return [];
    return (data ?? []).map(
      (r: {
        entity_id: string;
        entity_type: string;
        avg_rating: number;
        listen_count: number;
      }) => ({
        entity_id: r.entity_id,
        entity_type: r.entity_type ?? "song",
        avg_rating: Number(r.avg_rating) || 0,
        listen_count: Number(r.listen_count) || 0,
      }),
    );
  } catch {
    return [];
  }
}

export async function getTrendingEntitiesCached(limit = 20): Promise<TrendingEntity[]> {
  const key = `trending:${limit}`;
  const now = Date.now();
  const hit = trendingCache.get(key) as CacheEntry<TrendingEntity[]> | undefined;
  if (hit && hit.expiresAt > now) return hit.data;
  prune(trendingCache as Map<string, CacheEntry<unknown[]>>);

  const fromRedis = await readDiscoverCache<TrendingEntity[]>(key);
  if (fromRedis !== undefined) {
    trendingCache.set(key, { data: fromRedis, expiresAt: now + TTL_MS });
    return fromRedis;
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

export async function getRisingArtistsCached(
  limit = 20,
  windowDays = 7,
): Promise<RisingArtist[]> {
  const key = `rising:${limit}:${windowDays}`;
  const now = Date.now();
  const hit = risingCache.get(key) as CacheEntry<RisingArtist[]> | undefined;
  if (hit && hit.expiresAt > now) return hit.data;
  prune(risingCache as Map<string, CacheEntry<unknown[]>>);

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
  const hit = hiddenCache.get(key) as CacheEntry<HiddenGem[]> | undefined;
  if (hit && hit.expiresAt > now) return hit.data;
  prune(hiddenCache as Map<string, CacheEntry<unknown[]>>);

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
