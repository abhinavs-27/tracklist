import { getSupabase } from "../lib/supabase";

export type EntityReviewItem = {
  id: string;
  user_id: string;
  username: string | null;
  entity_type: string;
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  user?: { id: string; username: string; avatar_url: string | null } | null;
};

export type ReviewsResult = {
  reviews: EntityReviewItem[];
  average_rating: number | null;
  count: number;
  my_review: EntityReviewItem | null;
};

async function fetchUserMap(
  supabase: ReturnType<typeof getSupabase>,
  userIds: string[],
): Promise<Map<string, { id: string; username: string; avatar_url: string | null }>> {
  if (userIds.length === 0) return new Map();
  const { data: users } = await supabase
    .from("users")
    .select("id, username, avatar_url")
    .in("id", userIds);
  return new Map((users ?? []).map((u) => [u.id, u]));
}

/** Reviews for an entity. Capped at 20 for performance. */
export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
  viewerUserId: string | null,
  sessionUsername: string | null = null,
): Promise<ReviewsResult | null> {
  const cappedLimit = Math.min(Math.max(1, limit), 20);
  try {
    const supabase = getSupabase();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (error) return null;

    const reviewRows = rows ?? [];
    const userIds = [...new Set(reviewRows.map((r) => r.user_id))];
    const userMap = await fetchUserMap(supabase, userIds);

    const reviews: EntityReviewItem[] = reviewRows.map((r) => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        username: u?.username ?? null,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: u
          ? { id: u.id, username: u.username, avatar_url: u.avatar_url ?? null }
          : null,
      };
    });

    const count = reviews.length;
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    const average_rating =
      count > 0 ? Math.round((sum / count) * 10) / 10 : null;

    const { count: total_count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    let my_review: EntityReviewItem | null = null;
    if (viewerUserId) {
      const { data: myRow } = await supabase
        .from("reviews")
        .select(
          "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
        )
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("user_id", viewerUserId)
        .maybeSingle();
      if (myRow) {
        my_review = {
          id: myRow.id,
          user_id: myRow.user_id,
          username: sessionUsername,
          entity_type: myRow.entity_type,
          entity_id: myRow.entity_id,
          rating: myRow.rating,
          review_text: myRow.review_text ?? null,
          created_at: myRow.created_at,
          updated_at: myRow.updated_at,
        };
      }
    }

    return {
      reviews,
      average_rating,
      count: total_count ?? reviews.length,
      my_review,
    };
  } catch (e) {
    console.error("[reviews] getReviewsForEntity failed:", e);
    return null;
  }
}
