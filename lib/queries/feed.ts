import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase-server";

export type FeedEventType = "review" | "follow" | "listen";

export type FeedEvent = {
  eventType: FeedEventType;
  eventId: string;
  actorId: string;
  entityId: string;
  createdAt: string;
};

type DbFeedRow = {
  event_type: FeedEventType;
  event_id: string;
  actor_id: string;
  entity_id: string;
  created_at: string;
};

/**
 * Unified activity feed using a UNION ALL query in the database.
 *
 * Backed by a Postgres function (to be created via migration) similar to:
 *
 *   SELECT 'review' AS event_type, r.id AS event_id, r.user_id AS actor_id, r.entity_id AS entity_id, r.created_at
 *   FROM reviews r
 *   WHERE r.user_id IN (SELECT following_id FROM follows WHERE follower_id = p_user_id)
 *     AND (p_cursor IS NULL OR r.created_at < p_cursor)
 *
 *   UNION ALL
 *   SELECT 'follow', f.id, f.follower_id, f.following_id, f.created_at
 *   FROM follows f
 *   INNER JOIN follows f1 ON f.follower_id = f1.following_id
 *   WHERE f1.follower_id = p_user_id
 *     AND (p_cursor IS NULL OR f.created_at < p_cursor)
 *
 *   UNION ALL
 *   SELECT 'listen', l.id, l.user_id, l.album_id, l.created_at
 *   FROM logs l
 *   WHERE l.user_id IN (SELECT following_id FROM follows WHERE follower_id = p_user_id)
 *     AND (p_cursor IS NULL OR l.created_at < p_cursor)
 *
 *   ORDER BY created_at DESC
 *   LIMIT p_limit;
 */
export async function getActivityFeed(
  userId: string,
  limit: number,
  cursor?: string | null,
): Promise<FeedEvent[]> {
  const supabase = await createSupabaseServerClient();
  const cappedLimit = Math.min(Math.max(limit, 1), 100);

  const { data, error } = await supabase.rpc("get_activity_feed", {
    p_user_id: userId,
    p_limit: cappedLimit,
    p_cursor: cursor ?? null,
  });

  if (error) {
    console.error("[queries/feed] get_activity_feed RPC failed:", error);
    return [];
  }

  const rows = (data ?? []) as DbFeedRow[];

  return rows.map((row) => ({
    eventType: row.event_type,
    eventId: row.event_id,
    actorId: row.actor_id,
    entityId: row.entity_id,
    createdAt: row.created_at,
  }));
}

