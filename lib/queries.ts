import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ListenLogWithUser, ReviewWithUser } from "@/types";

// ---------------------------------------------------------------------------
// Passive listen logs (Spotify history)
// ---------------------------------------------------------------------------

export async function getListenLogsForUser(
  userId: string,
  limit = 30,
): Promise<ListenLogWithUser[]> {
  return getListenLogsInternal({ userId, limit });
}

export async function getListenLogsForTrack(
  spotifyTrackId: string,
  limit = 30,
): Promise<ListenLogWithUser[]> {
  return getListenLogsInternal({ spotifyTrackId, limit });
}

async function getListenLogsInternal(opts: {
  userId?: string;
  spotifyTrackId?: string;
  limit: number;
}): Promise<ListenLogWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("logs")
      .select("id, user_id, spotify_song_id, played_at, created_at")
      .order("played_at", { ascending: false })
      .limit(opts.limit);

    if (opts.userId) query = query.eq("user_id", opts.userId);
    if (opts.spotifyTrackId)
      query = query.eq("spotify_song_id", opts.spotifyTrackId);

    const { data: logs, error } = await query;
    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .in("id", userIds);

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      spotify_song_id: log.spotify_song_id,
      played_at: log.played_at,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getListenLogsInternal failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Active reviews (ratings + optional text)
// ---------------------------------------------------------------------------

type EntityReviewItem = {
  id: string;
  user_id: string;
  username: string | null;
  entity_type: string;
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewsResult = {
  reviews: EntityReviewItem[];
  average_rating: number | null;
  count: number;
  my_review: EntityReviewItem | null;
};

export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
): Promise<ReviewsResult | null> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return null;

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    const reviewRows = rows ?? [];
    const userIds = [...new Set(reviewRows.map((r) => r.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, username")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const reviews: EntityReviewItem[] = reviewRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: userMap.get(r.user_id)?.username ?? null,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

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
    if (userId) {
      const { data: myRow } = await supabase
        .from("reviews")
        .select(
          "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
        )
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (myRow) {
        const sessionUsername =
          (session?.user as { username?: string } | undefined)?.username ?? null;
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
    console.error("[queries] getReviewsForEntity failed:", e);
    return null;
  }
}

/** Fetch recent reviews by a user (for "Recent Activity" on profile). */
export async function getReviewsForUser(
  userId: string,
  limit = 30,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !rows?.length) return [];

    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .eq("id", userId);

    const user = users?.[0] ?? null;

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user,
    }));
  } catch (e) {
    console.error("[queries] getReviewsForUser failed:", e);
    return [];
  }
}

/** Fetch recent reviews from followed users (for the social feed). */
export async function getReviewFeed(
  userId: string,
  limit = 50,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: followings, error: followError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId);

    if (followError) throw followError;

    const followingIds = (followings ?? [])
      .map((f) => f.following_id)
      .slice(0, 500);
    if (followingIds.length === 0) return [];

    const cappedLimit = Math.min(limit, 100);

    const { data: rows, error: reviewsError } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .in("user_id", followingIds)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (reviewsError) throw reviewsError;
    if (!rows?.length) return [];

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .in("id", userIds);

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: userMap.get(r.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getReviewFeed failed:", e);
    return [];
  }
}
