-- Private listening: hide passive logs in feeds while keeping stats aggregates unchanged.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS logs_private BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.logs_private IS 'When true, passive listens are hidden from home/community feeds and from other users’ profile views; stats and taste match still use all logs.';

-- Home feed listen sessions: exclude users who opted into private logs.
CREATE OR REPLACE FUNCTION get_feed_listen_sessions(
  p_follower_id UUID,
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
    INNER JOIN follows f ON f.following_id = l.user_id AND f.follower_id = p_follower_id
    INNER JOIN users u ON u.id = l.user_id AND NOT COALESCE(u.logs_private, false)
    LEFT JOIN tracks s ON s.id = l.track_id
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
      MAX(album_id::text)::uuid AS album_id,
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
    r.track_id::text,
    r.album_id::text,
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

-- Community feed listen sessions (same privacy rule).
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
    INNER JOIN users u ON u.id = l.user_id AND NOT COALESCE(u.logs_private, false)
    LEFT JOIN tracks s ON s.id = l.track_id
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
      MAX(album_id::text)::uuid AS album_id,
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
    r.track_id::text,
    r.album_id::text,
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

-- Legacy unified activity feed (listen branch): hide private loggers.
CREATE OR REPLACE FUNCTION get_activity_feed(
  p_user_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  event_type TEXT,
  event_id UUID,
  actor_id UUID,
  entity_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH following AS (
    SELECT following_id
    FROM follows
    WHERE follower_id = p_user_id
  )
  SELECT
    'review' AS event_type,
    r.id AS event_id,
    r.user_id AS actor_id,
    r.entity_id::text AS entity_id,
    r.created_at
  FROM reviews r
  WHERE r.user_id IN (SELECT following_id FROM following)
    AND (p_cursor IS NULL OR r.created_at < p_cursor)

  UNION ALL

  SELECT
    'follow' AS event_type,
    f2.id AS event_id,
    f2.follower_id AS actor_id,
    f2.following_id::text AS entity_id,
    f2.created_at
  FROM follows f2
  INNER JOIN follows f1 ON f2.follower_id = f1.following_id
  WHERE f1.follower_id = p_user_id
    AND (p_cursor IS NULL OR f2.created_at < p_cursor)

  UNION ALL

  SELECT
    'listen' AS event_type,
    l.id AS event_id,
    l.user_id AS actor_id,
    l.track_id::text AS entity_id,
    l.listened_at AS created_at
  FROM logs l
  INNER JOIN users u ON u.id = l.user_id AND NOT COALESCE(u.logs_private, false)
  WHERE l.user_id IN (SELECT following_id FROM following)
    AND (p_cursor IS NULL OR l.listened_at < p_cursor)

  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;
