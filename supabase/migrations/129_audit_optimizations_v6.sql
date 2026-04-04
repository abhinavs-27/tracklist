-- Migration 129: Audit optimizations v6
-- These indexes support common query patterns identified in the latest database audit.

-- Lists: Optimize list retrieval for a user by creation date.
CREATE INDEX IF NOT EXISTS idx_lists_user_id_created_at ON lists(user_id, created_at DESC);

-- List Items: Optimize fetching ordered items in a list.
CREATE INDEX IF NOT EXISTS idx_list_items_list_id_position ON list_items(list_id, position);

-- Reviews: Optimize fetching latest reviews for a user.
CREATE INDEX IF NOT EXISTS idx_reviews_user_id_created_at ON reviews(user_id, created_at DESC);

-- Follows: Optimize checking if a viewer follows a target user.
CREATE INDEX IF NOT EXISTS idx_follows_follower_following ON follows(follower_id, following_id);

-- Community Member Stats: Optimize active user count and member list by activity.
CREATE INDEX IF NOT EXISTS idx_community_member_stats_community_id_listen_7d ON community_member_stats(community_id, listen_count_7d DESC);

-- RPC: count_logs_by_track_ids (ensure it exists if not already applied)
CREATE OR REPLACE FUNCTION public.count_logs_by_track_ids(p_track_ids uuid[])
RETURNS TABLE (track_id uuid, play_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT l.track_id, COUNT(*)::bigint
  FROM logs l
  WHERE l.track_id = ANY(p_track_ids)
  GROUP BY l.track_id;
$$;
