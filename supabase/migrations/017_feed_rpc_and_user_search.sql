-- 017_feed_rpc_and_user_search.sql
-- Feed via JOIN (index-friendly), user search index, and suggested users.

-- Index for user search (ILIKE on username)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Feed reviews: JOIN follows so Postgres can use indexes on follows(follower_id) and reviews(user_id, created_at)
CREATE OR REPLACE FUNCTION get_feed_reviews(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS SETOF reviews
LANGUAGE sql
STABLE
AS $$
  SELECT r.*
  FROM reviews r
  INNER JOIN follows f ON r.user_id = f.following_id
  WHERE f.follower_id = p_follower_id
    AND (p_cursor IS NULL OR r.created_at < p_cursor)
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- Feed follow events: follows where the actor (follower_id) is someone the viewer follows
CREATE OR REPLACE FUNCTION get_feed_follows(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS SETOF follows
LANGUAGE sql
STABLE
AS $$
  SELECT f2.*
  FROM follows f2
  INNER JOIN follows f1 ON f2.follower_id = f1.following_id
  WHERE f1.follower_id = p_follower_id
    AND (p_cursor IS NULL OR f2.created_at < p_cursor)
  ORDER BY f2.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;
