-- Suggested users: scalable server-side query (exclude self and already followed, order by follower count).
-- Replaces in-memory loading of all users and follows in getSuggestedUsers.

CREATE OR REPLACE FUNCTION get_suggested_users(p_user_id UUID, p_limit INT DEFAULT 10)
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
  WHERE u.id != p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM follows f2
      WHERE f2.follower_id = p_user_id AND f2.following_id = u.id
    )
  GROUP BY u.id, u.username, u.avatar_url
  ORDER BY followers_count DESC, u.username
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;
