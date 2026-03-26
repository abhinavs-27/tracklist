-- Same bucketing as get_feed_listen_sessions, but for users in a community (not "people you follow").

CREATE OR REPLACE FUNCTION get_community_listen_sessions(
  p_community_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  type TEXT,
  user_id UUID,
  track_id TEXT,
  album_id TEXT,
  track_name TEXT,
  artist_name TEXT,
  song_count BIGINT,
  first_listened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      l.user_id,
      l.track_id,
      l.listened_at,
      COALESCE(l.album_id, s.album_id) AS resolved_album_id,
      COALESCE(s.name, 'Unknown') AS song_name,
      COALESCE(ar_song.name, ar_album.name, 'Unknown') AS artist_display
    FROM logs l
    INNER JOIN community_members cm
      ON cm.community_id = p_community_id
      AND cm.user_id = l.user_id
    LEFT JOIN songs s ON s.id = l.track_id
    LEFT JOIN albums al ON al.id = COALESCE(l.album_id, s.album_id)
    LEFT JOIN artists ar_song ON ar_song.id = COALESCE(l.artist_id, s.artist_id)
    LEFT JOIN artists ar_album ON ar_album.id = al.artist_id
    WHERE COALESCE(l.album_id, s.album_id) IS NOT NULL
      AND l.listened_at >= (now() - interval '7 days')
      AND (p_cursor IS NULL OR l.listened_at < p_cursor)
  ),
  bucket_30 AS (
    SELECT
      b.user_id,
      b.track_id,
      b.resolved_album_id AS album_id,
      b.song_name AS track_name,
      b.artist_display AS artist_name,
      (date_trunc('hour', b.listened_at) + (floor(EXTRACT(MINUTE FROM b.listened_at) / 30)::int * 30) * interval '1 minute') AS session_bucket,
      b.listened_at
    FROM base b
  ),
  sessions AS (
    SELECT
      user_id,
      track_id,
      MAX(album_id) AS album_id,
      MAX(track_name) AS track_name,
      MAX(artist_name) AS artist_name,
      session_bucket,
      COUNT(*)::BIGINT AS song_count,
      MIN(listened_at) AS first_listened_at,
      MAX(listened_at) AS created_at
    FROM bucket_30
    GROUP BY user_id, track_id, session_bucket
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
    r.track_id,
    r.album_id,
    r.track_name,
    r.artist_name,
    r.song_count,
    r.first_listened_at,
    r.created_at
  FROM ranked r
  WHERE r.rn <= 3
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

COMMENT ON FUNCTION get_community_listen_sessions IS 'Listen sessions for community feed (same logic as home feed, scoped by community_members).';
