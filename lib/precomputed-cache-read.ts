import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LeaderboardEntry } from "@/lib/queries";
import type { TrendingEntity } from "@/types";

export type LeaderboardCacheRow = {
  items: LeaderboardEntry[];
  nextCursor: number | null;
  total: number;
};

function cacheKey(
  type: "popular" | "topRated" | "mostFavorited",
  entity: "song" | "album",
): string {
  return `${type}:${entity}`;
}

/**
 * Read global leaderboard from precomputed table (no year filters).
 * Returns null if row missing or parse fails — caller should fall back to live query.
 */
export async function getLeaderboardPageFromPrecomputed(
  type: "popular" | "topRated" | "mostFavorited",
  entity: "song" | "album",
  limit: number,
  startIndex: number,
): Promise<LeaderboardCacheRow | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("leaderboard_cache")
      .select("entries, total_count")
      .eq("id", cacheKey(type, entity))
      .maybeSingle();

    if (error || !data?.entries) return null;

    const entries = data.entries as LeaderboardEntry[];
    if (!Array.isArray(entries)) return null;

    if (entries.length === 0) {
      return {
        items: [],
        nextCursor: null,
        total:
          typeof data.total_count === "number" && Number.isFinite(data.total_count)
            ? data.total_count
            : 0,
      };
    }

    const total =
      typeof data.total_count === "number" && Number.isFinite(data.total_count)
        ? data.total_count
        : entries.length;

    if (startIndex >= entries.length) return null;

    const pageItems = entries.slice(startIndex, startIndex + limit);
    const lastRank = startIndex + pageItems.length;
    const hasMore = lastRank < total;
    const nextCursor = hasMore ? lastRank : null;

    return {
      items: pageItems,
      nextCursor,
      total,
    };
  } catch {
    return null;
  }
}

/** Trending snapshot written by daily cron (after discover MV refresh). */
export async function getTrendingEntitiesFromPrecomputed(
  limit: number,
): Promise<TrendingEntity[] | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("trending_cache")
      .select("entities")
      .eq("id", 1)
      .maybeSingle();

    if (error || data?.entities == null) return null;
    const raw = data.entities as unknown;
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const out: TrendingEntity[] = [];
    for (const row of raw) {
      const r = row as {
        entity_id?: string;
        entity_type?: string;
        listen_count?: number;
      };
      if (!r?.entity_id) continue;
      out.push({
        entity_id: r.entity_id,
        entity_type: (r.entity_type as TrendingEntity["entity_type"]) ?? "song",
        listen_count: Number(r.listen_count) || 0,
      });
      if (out.length >= limit) break;
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}
