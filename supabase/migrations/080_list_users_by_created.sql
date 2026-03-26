-- Public user directory: oldest signups first (for /search/users browse before typing).

CREATE OR REPLACE FUNCTION list_users_by_created(
  p_limit INT DEFAULT 10,
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
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.username,
    u.avatar_url,
    (
      SELECT COUNT(*)::BIGINT
      FROM follows f
      WHERE f.following_id = u.id
    ) AS followers_count
  FROM users u
  WHERE (p_exclude_user_id IS NULL OR u.id <> p_exclude_user_id)
  ORDER BY u.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
