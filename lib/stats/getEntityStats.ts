import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export type EntityStatsRow = {
  entity_type: string;
  entity_id: string;
  play_count: number;
  review_count: number;
  avg_rating: number | null;
  favorite_count: number;
  updated_at: string;
};

export type EntityStats = {
  playCount: number;
  reviewCount: number;
  avgRating: number | null;
  favoriteCount: number;
  updatedAt: string | null;
};

const DEFAULT_STATS: EntityStats = {
  playCount: 0,
  reviewCount: 0,
  avgRating: null,
  favoriteCount: 0,
  updatedAt: null,
};

/**
 * Read precomputed stats for any entity from entity_stats.
 * Falls back to zeros when no row exists.
 */
export async function getEntityStats(
  entityType: string,
  entityId: string,
): Promise<EntityStats> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("entity_stats")
      .select(
        "entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at",
      )
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (error) {
      console.error("[stats] getEntityStats failed", {
        entityType,
        entityId,
        error,
      });
      return { ...DEFAULT_STATS };
    }

    if (!data) return { ...DEFAULT_STATS };

    const row = data as EntityStatsRow;

    return {
      playCount: row.play_count ?? 0,
      reviewCount: row.review_count ?? 0,
      avgRating:
        row.avg_rating != null ? Number(row.avg_rating) : (null as number | null),
      favoriteCount: row.favorite_count ?? 0,
      updatedAt: row.updated_at ?? null,
    };
  } catch (e) {
    console.error("[stats] getEntityStats unexpected error", {
      entityType,
      entityId,
      error: e,
    });
    return { ...DEFAULT_STATS };
  }
}

