-- Migration 023: Query optimizations and recommended indexes
-- Supports pagination and efficient aggregation for social queries.

-- Index for reviews: used in getReviewsForEntity and trending aggregations.
CREATE INDEX IF NOT EXISTS idx_reviews_entity_type_entity_id_created_at
  ON reviews(entity_type, entity_id, created_at DESC);

-- Index for logs: composite index to support common (user_id, listened_at) range queries.
CREATE INDEX IF NOT EXISTS idx_logs_user_id_listened_at
  ON logs(user_id, listened_at DESC);

-- Index for list items: explicit list_id index if not covered by composite.
-- migration 020 already has idx_list_items_list_position ON list_items(list_id, position);
-- but we might want one on just list_id for simple lookups or joins if needed.
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);

-- Update get_user_search to support pagination (offset)
CREATE OR REPLACE FUNCTION get_user_search(
  p_query TEXT,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_exclude_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  avatar_url TEXT,
  followers_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    u.id,
    u.username,
    u.avatar_url,
    COUNT(f.following_id)::BIGINT AS followers_count
  FROM users u
  LEFT JOIN follows f ON f.following_id = u.id
  WHERE (p_exclude_user_id IS NULL OR u.id != p_exclude_user_id)
    AND (LENGTH(TRIM(p_query)) >= 2)
    AND u.username ILIKE '%' || TRIM(p_query) || '%'
  GROUP BY u.id, u.username, u.avatar_url
  ORDER BY u.username
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
