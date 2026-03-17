-- 045_activity_feed_union.sql
-- Unified activity feed via UNION ALL so Postgres handles sorting and limiting.

CREATE OR REPLACE FUNCTION get_activity_feed(
  p_user_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  event_type TEXT,
  event_id UUID,
  actor_id UUID,
  entity_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH following AS (
    SELECT following_id
    FROM follows
    WHERE follower_id = p_user_id
  )
  SELECT
    'review' AS event_type,
    r.id AS event_id,
    r.user_id AS actor_id,
    r.entity_id AS entity_id,
    r.created_at
  FROM reviews r
  WHERE r.user_id IN (SELECT following_id FROM following)
    AND (p_cursor IS NULL OR r.created_at < p_cursor)

  UNION ALL

  SELECT
    'follow' AS event_type,
    f2.id AS event_id,
    f2.follower_id AS actor_id,
    f2.following_id::text AS entity_id,
    f2.created_at
  FROM follows f2
  INNER JOIN follows f1 ON f2.follower_id = f1.following_id
  WHERE f1.follower_id = p_user_id
    AND (p_cursor IS NULL OR f2.created_at < p_cursor)

  UNION ALL

  SELECT
    'listen' AS event_type,
    l.id AS event_id,
    l.user_id AS actor_id,
    l.track_id AS entity_id,
    l.listened_at AS created_at
  FROM logs l
  WHERE l.user_id IN (SELECT following_id FROM following)
    AND (p_cursor IS NULL OR l.listened_at < p_cursor)

  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

