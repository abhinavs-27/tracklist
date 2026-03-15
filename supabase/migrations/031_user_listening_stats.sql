-- 031_user_listening_stats.sql
-- Precomputed per-user listening stats to avoid heavy scans on logs.

-- Daily rollups of listening activity.
CREATE TABLE IF NOT EXISTS user_daily_stats (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  listen_count INT NOT NULL DEFAULT 0,
  unique_tracks INT NOT NULL DEFAULT 0,
  unique_artists INT NOT NULL DEFAULT 0,
  minutes_listened INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_stats_user_date
  ON user_daily_stats(user_id, date DESC);

-- Optional: precomputed top albums per user + period.
CREATE TABLE IF NOT EXISTS user_top_albums (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL,
  listen_count INT NOT NULL DEFAULT 0,
  period TEXT NOT NULL CHECK (period IN ('week','month','all_time')),
  PRIMARY KEY (user_id, album_id, period)
);

CREATE INDEX IF NOT EXISTS idx_user_top_albums_user_period
  ON user_top_albums(user_id, period);

-- Optional: precomputed top artists per user + period.
CREATE TABLE IF NOT EXISTS user_top_artists (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL,
  listen_count INT NOT NULL DEFAULT 0,
  period TEXT NOT NULL CHECK (period IN ('week','month','all_time')),
  PRIMARY KEY (user_id, artist_id, period)
);

CREATE INDEX IF NOT EXISTS idx_user_top_artists_user_period
  ON user_top_artists(user_id, period);

-- ---------------------------------------------------------------------------
-- Function: update_user_daily_stats(user_id, date)
-- Recomputes stats for a single user + day from logs + songs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_user_daily_stats(p_user_id UUID, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
BEGIN
  INSERT INTO user_daily_stats (
    user_id,
    date,
    listen_count,
    unique_tracks,
    unique_artists,
    minutes_listened
  )
  SELECT
    p_user_id AS user_id,
    p_date AS date,
    COUNT(*)::INT AS listen_count,
    COUNT(DISTINCT l.track_id)::INT AS unique_tracks,
    COUNT(DISTINCT s.artist_id)::INT AS unique_artists,
    COALESCE(
      ROUND(SUM(COALESCE(s.duration_ms, 0)) / 60000.0)::INT,
      0
    ) AS minutes_listened
  FROM logs l
  LEFT JOIN songs s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at::DATE = p_date
  GROUP BY p_user_id, p_date
  ON CONFLICT (user_id, date) DO UPDATE
  SET
    listen_count = EXCLUDED.listen_count,
    unique_tracks = EXCLUDED.unique_tracks,
    unique_artists = EXCLUDED.unique_artists,
    minutes_listened = EXCLUDED.minutes_listened;
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: keep today's stats up to date on new logs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_user_daily_stats_on_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM update_user_daily_stats(NEW.user_id, NEW.listened_at::DATE);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logs_user_daily_stats ON logs;
CREATE TRIGGER trg_logs_user_daily_stats
AFTER INSERT ON logs
FOR EACH ROW
EXECUTE FUNCTION refresh_user_daily_stats_on_log();

