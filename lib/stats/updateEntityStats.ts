import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type EntityType = "song" | "album" | "artist";

/**
 * Increment play_count for an entity (song/album/artist).
 * Backed by the increment_entity_play_count Postgres function.
 */
export async function incrementPlayCount(
  entityType: EntityType,
  entityId: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("increment_entity_play_count", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    console.error("[stats] incrementPlayCount failed", {
      entityType,
      entityId,
      error,
    });
  }
}

/**
 * Increment review_count and update avg_rating for an entity.
 * Uses a numerically stable running average in the database.
 */
export async function incrementReviewCount(
  entityType: EntityType,
  entityId: string,
  rating: number,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("increment_entity_review_count", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_rating: rating,
  });
  if (error) {
    console.error("[stats] incrementReviewCount failed", {
      entityType,
      entityId,
      rating,
      error,
    });
  }
}

/**
 * Increment favorite_count for an entity.
 */
export async function incrementFavoriteCount(
  entityType: EntityType,
  entityId: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("increment_entity_favorite_count", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) {
    console.error("[stats] incrementFavoriteCount failed", {
      entityType,
      entityId,
      error,
    });
  }
}

