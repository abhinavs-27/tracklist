import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LogWithUser } from "@/types";

export async function getLogsForUser(
  userId: string,
  limit = 30,
): Promise<LogWithUser[]> {
  return getLogsInternal({ userId, limit });
}

export async function getLogsForSpotifyId(
  spotifyId: string,
  limit = 30,
): Promise<LogWithUser[]> {
  return getLogsInternal({ spotifyId, limit });
}

async function getLogsInternal(opts: {
  userId?: string;
  spotifyId?: string;
  limit: number;
}): Promise<LogWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("logs")
      .select("id, user_id, spotify_song_id, played_at, created_at")
      .order("created_at", { ascending: false })
      .limit(opts.limit);

    if (opts.userId) query = query.eq("user_id", opts.userId);
    if (opts.spotifyId) query = query.eq("spotify_song_id", opts.spotifyId);

    const { data: logs, error: logsError } = await query;
    if (logsError || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .in("id", userIds);

    const userMap = new Map(
      (users ?? []).map((u) => [u.id, u]),
    );

    const logIds = logs.map((l) => l.id);
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from("likes").select("log_id").in("log_id", logIds),
      supabase.from("comments").select("log_id").in("log_id", logIds),
    ]);

    const likeCountMap = new Map<string, number>();
    (likesRes.data ?? []).forEach((l) => {
      likeCountMap.set(l.log_id, (likeCountMap.get(l.log_id) ?? 0) + 1);
    });
    const commentCountMap = new Map<string, number>();
    (commentsRes.data ?? []).forEach((c) => {
      commentCountMap.set(c.log_id, (commentCountMap.get(c.log_id) ?? 0) + 1);
    });

    const session = await getServerSession(authOptions);
    let likedSet = new Set<string>();
    if (session?.user?.id) {
      const { data: userLikes } = await supabase
        .from("likes")
        .select("log_id")
        .eq("user_id", session.user.id)
        .in("log_id", logIds);
      likedSet = new Set((userLikes ?? []).map((l) => l.log_id));
    }

    return logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      spotify_id: log.spotify_song_id,
      type: "song" as const,
      title: null,
      rating: null,
      review: null,
      listened_at: log.played_at,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
      like_count: likeCountMap.get(log.id) ?? 0,
      comment_count: commentCountMap.get(log.id) ?? 0,
      liked: likedSet.has(log.id),
    }));
  } catch (e) {
    console.error("[queries] getLogsInternal failed:", e);
    return [];
  }
}

export type ReviewItem = {
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
  reviews: ReviewItem[];
  average_rating: number | null;
  count: number;
  my_review: ReviewItem | null;
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
    const userMap = new Map(
      (users ?? []).map((u) => [u.id, u]),
    );

    const reviews: ReviewItem[] = reviewRows.map((r) => {
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

    let my_review: ReviewItem | null = null;
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
        my_review = {
          id: myRow.id,
          user_id: myRow.user_id,
          username: session?.user?.username ?? null,
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
