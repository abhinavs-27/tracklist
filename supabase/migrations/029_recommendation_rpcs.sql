-- Recommendation engine: co-listening from logs.
-- Uses existing indexes: idx_logs_user (015), idx_logs_track_id (015), idx_songs_album (009).

-- Albums frequently listened to by users who also listened to the target album.
CREATE OR REPLACE FUNCTION get_album_recommendations(
  p_album_id TEXT,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  album_id TEXT,
  score BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH target_users AS (
    SELECT DISTINCT l.user_id
    FROM logs l
    INNER JOIN songs s ON s.id = l.track_id
    WHERE s.album_id = p_album_id
  ),
  co_listens AS (
    SELECT
      s.album_id AS recommended_album_id,
      COUNT(*)::BIGINT AS score
    FROM logs l
    INNER JOIN songs s ON s.id = l.track_id
    WHERE l.user_id IN (SELECT target_users.user_id FROM target_users)
      AND s.album_id IS NOT NULL
      AND s.album_id != p_album_id
    GROUP BY s.album_id
  )
  SELECT
    co_listens.recommended_album_id AS album_id,
    co_listens.score
  FROM co_listens
  ORDER BY co_listens.score DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 20));
$$;

-- Personalized: other albums listened to by users who listened to the same albums as this user.
-- Excludes albums the user has already listened to.
CREATE OR REPLACE FUNCTION get_user_recommendations(
  p_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  album_id TEXT,
  score BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH user_albums AS (
    SELECT DISTINCT s.album_id
    FROM logs l
    INNER JOIN songs s ON s.id = l.track_id
    WHERE l.user_id = p_user_id
      AND s.album_id IS NOT NULL
  ),
  co_listeners AS (
    SELECT DISTINCT l.user_id
    FROM logs l
    INNER JOIN songs s ON s.id = l.track_id
    WHERE s.album_id IN (SELECT user_albums.album_id FROM user_albums)
      AND l.user_id != p_user_id
  ),
  recommended AS (
    SELECT
      s.album_id AS recommended_album_id,
      COUNT(*)::BIGINT AS score
    FROM logs l
    INNER JOIN songs s ON s.id = l.track_id
    WHERE l.user_id IN (SELECT co_listeners.user_id FROM co_listeners)
      AND s.album_id IS NOT NULL
      AND s.album_id NOT IN (SELECT user_albums.album_id FROM user_albums)
    GROUP BY s.album_id
  )
  SELECT
    recommended.recommended_album_id AS album_id,
    recommended.score
  FROM recommended
  ORDER BY recommended.score DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 20));
$$;
