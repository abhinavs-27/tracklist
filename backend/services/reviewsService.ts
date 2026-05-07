import { getSupabase } from "../lib/supabase";
import { getReviewsForEntity as getReviewsShared } from "../../lib/queries";

export type { ReviewsResult } from "../../types";

/**
 * Reviews for an entity. Capped at 20 for performance.
 * Express-compatible wrapper for shared query logic.
 */
export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
  viewerUserId: string | null,
  sessionUsername: string | null = null,
) {
  const supabase = getSupabase();
  // Using the shared logic from lib/queries.ts
  return getReviewsShared(
    entityType,
    entityId,
    limit,
    supabase,
    viewerUserId,
    sessionUsername
  );
}
