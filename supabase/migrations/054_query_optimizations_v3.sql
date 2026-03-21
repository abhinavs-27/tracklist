-- 054_query_optimizations_v3.sql
-- Recommended optimizations from query audit: explicit columns in RPCs, improved Hidden Gems logic, and composite indexes.

-- 1. Refactor get_feed_reviews to use explicit columns and return TABLE for clarity.
DROP FUNCTION IF EXISTS get_feed_reviews(UUID, TIMESTAMPTZ, INT);
CREATE OR REPLACE FUNCTION get_feed_reviews(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  entity_type TEXT,
  entity_id TEXT,
  rating INT,
  review_text TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT r.id, r.user_id, r.entity_type, r.entity_id, r.rating, r.review_text, r.created_at, r.updated_at
  FROM reviews r
  INNER JOIN follows f ON r.user_id = f.following_id
  WHERE f.follower_id = p_follower_id
    AND (p_cursor IS NULL OR r.created_at < p_cursor)
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- 2. Refactor get_feed_follows to use explicit columns and return TABLE.
DROP FUNCTION IF EXISTS get_feed_follows(UUID, TIMESTAMPTZ, INT);
CREATE OR REPLACE FUNCTION get_feed_follows(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  follower_id UUID,
  following_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT f2.id, f2.follower_id, f2.following_id, f2.created_at
  FROM follows f2
  INNER JOIN follows f1 ON f2.follower_id = f1.following_id
  WHERE f1.follower_id = p_follower_id
    AND (p_cursor IS NULL OR f2.created_at < p_cursor)
  ORDER BY f2.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- 3. Optimize get_hidden_gems to use the pre-aggregated entity_stats table (Migration 046).
-- This avoids expensive per-request aggregations on logs and reviews.
CREATE OR REPLACE FUNCTION get_hidden_gems(
  p_limit INT DEFAULT 20,
  p_min_rating NUMERIC DEFAULT 4,
  p_max_listens INT DEFAULT 50
)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, avg_rating NUMERIC, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    entity_id,
    entity_type,
    avg_rating::NUMERIC AS avg_rating,
    play_count::BIGINT AS listen_count
  FROM entity_stats
  WHERE entity_type IN ('album', 'song')
    AND avg_rating >= LEAST(GREATEST(COALESCE(p_min_rating, 4), 0), 5)
    AND play_count <= LEAST(GREATEST(COALESCE(p_max_listens, 50), 0), 10000)
  ORDER BY avg_rating DESC, play_count ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

-- 4. Add composite indexes for common profile and activity patterns.

-- logs: Optimize user history fetches (getListenLogsForUser)
CREATE INDEX IF NOT EXISTS idx_logs_user_listened_at ON logs(user_id, listened_at DESC);

-- reviews: Optimize user activity fetches (getReviewsForUser, getProfileActivity)
CREATE INDEX IF NOT EXISTS idx_reviews_user_created_at ON reviews(user_id, created_at DESC);
