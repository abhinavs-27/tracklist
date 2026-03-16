-- 043_audit_performance_indexes.sql
-- Additional indexes identified during the database query audit.

-- Reviews: Optimize entity-level fetching with ordering (getReviewsForEntity)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_created_at ON reviews(entity_type, entity_id, created_at DESC);

-- Users: Optimize username search (ILIKE)
-- Note: Requires pg_trgm extension if not enabled, but standard B-tree handles some prefix cases.
-- We use ILIKE '%sanitized%', so a GIST or GIN index with trgm would be better.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username gin_trgm_ops);

-- Lists: Optimize title search (ILIKE)
CREATE INDEX IF NOT EXISTS idx_lists_title_trgm ON lists USING gin (title gin_trgm_ops);

-- Logs: Optimize artist-level log fetching (getListenLogsForArtist via song join)
-- songs(artist_id) index already exists (migration 009)
-- logs(track_id, listened_at DESC) already exists (migration 037)

-- Follows: Optimize join-based pagination for followers/following
-- (following_id, users(username)) or (follower_id, users(username))
-- Standard indexes on follower_id and following_id exist.

-- RPC: Efficiently count items in multiple lists
CREATE OR REPLACE FUNCTION get_list_item_counts(p_list_ids UUID[])
RETURNS TABLE (list_id UUID, item_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT li.list_id, COUNT(*)::BIGINT
  FROM list_items li
  WHERE li.list_id = ANY(p_list_ids)
  GROUP BY li.list_id;
$$;
