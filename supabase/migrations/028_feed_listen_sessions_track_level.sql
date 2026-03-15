-- Feed listen sessions: track-level rows so collapsed summary can show individual songs.
-- Source: spotify_recent_tracks (last 7 days, followed users). One row per (user, track, 30-min bucket).
-- Drop first because return type (OUT parameters) changed.

DROP FUNCTION IF EXISTS get_feed_listen_sessions(UUID, TIMESTAMPTZ, INT);

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
  WITH bucket_30 AS (
    SELECT
      srt.user_id,
      srt.track_id,
      srt.album_id,
      srt.track_name,
      srt.artist_name,
      (date_trunc('hour', srt.played_at) + (floor(EXTRACT(MINUTE FROM srt.played_at) / 30)::int * 30) * interval '1 minute') AS session_bucket,
      srt.played_at
    FROM spotify_recent_tracks srt
    INNER JOIN follows f ON f.following_id = srt.user_id AND f.follower_id = p_follower_id
    WHERE srt.album_id IS NOT NULL
      AND srt.played_at >= (now() - interval '7 days')
      AND (p_cursor IS NULL OR srt.played_at < p_cursor)
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
      MIN(played_at) AS first_listened_at,
      MAX(played_at) AS created_at
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
