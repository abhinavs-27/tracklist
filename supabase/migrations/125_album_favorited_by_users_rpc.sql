-- Paginated list of users who favorited an album (profile favorite albums).
-- Used by GET /api/albums/[id]/favorited-by.

CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_album_id
  ON user_favorite_albums (album_id);

CREATE OR REPLACE FUNCTION public.get_album_favorited_by_users(
  p_album_id UUID,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  avatar_url TEXT,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      u.id,
      u.username,
      u.avatar_url,
      COUNT(*) OVER () AS total_count
    FROM user_favorite_albums ufa
    INNER JOIN users u ON u.id = ufa.user_id
    WHERE ufa.album_id = p_album_id
  )
  SELECT r.id, r.username, r.avatar_url, r.total_count
  FROM ranked r
  ORDER BY r.username ASC
  LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_album_favorited_by_users(UUID, INT, INT)
  TO anon, authenticated, service_role;
