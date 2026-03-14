-- User search with follower count, excluding a user (e.g. current user).
-- Safe: query length and limit enforced by caller; p_query is used in ILIKE only.

CREATE OR REPLACE FUNCTION get_user_search(
  p_query TEXT,
  p_limit INT DEFAULT 20,
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
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;
