-- Feed listen sessions: aggregate logs into 30-minute album-level sessions for the feed.
-- Relies on: idx_logs_listened_at (015), idx_logs_track_id (015), idx_songs_album (009), idx_follows_following (001).

CREATE OR REPLACE FUNCTION get_feed_listen_sessions(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  type TEXT,
  user_id UUID,
  album_id TEXT,
  song_count BIGINT,
  first_listened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH sessions AS (
    SELECT
      l.user_id,
      s.album_id,
      (date_trunc('hour', l.listened_at) + (floor(EXTRACT(MINUTE FROM l.listened_at) / 30) * 30 * interval '1 minute')) AS session_bucket,
      COUNT(*)::BIGINT AS song_count,
      MIN(l.listened_at) AS first_listened_at,
      MAX(l.listened_at) AS created_at
    FROM logs l
    INNER JOIN songs s ON s.id = l.track_id
    LEFT JOIN follows f ON f.following_id = l.user_id AND f.follower_id = p_follower_id
    WHERE (f.following_id IS NOT NULL OR l.user_id = p_follower_id)
      AND (p_cursor IS NULL OR l.listened_at < p_cursor)
    GROUP BY l.user_id, s.album_id, (date_trunc('hour', l.listened_at) + (floor(EXTRACT(MINUTE FROM l.listened_at) / 30) * 30 * interval '1 minute'))
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.user_id, date_trunc('hour', s.created_at)
        ORDER BY s.created_at DESC
      ) AS rn
    FROM sessions s
  )
  SELECT
    'listen_session'::TEXT AS type,
    r.user_id,
    r.album_id,
    r.song_count,
    r.first_listened_at,
    r.created_at
  FROM ranked r
  WHERE r.rn <= 3
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;
