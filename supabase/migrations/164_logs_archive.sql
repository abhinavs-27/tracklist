-- supabase/migrations/164_logs_archive.sql
-- Archive table for logs older than 180 days.
-- Rows are moved here monthly by archive_old_logs() to keep the hot logs table small.
-- No FK from user_listening_aggregate_ingest (that tracking table uses cascade on logs).

CREATE TABLE IF NOT EXISTS logs_archive (
  id           UUID        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id     TEXT,
  type         TEXT,
  title        TEXT,
  rating       SMALLINT,
  review       TEXT,
  listened_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT,
  album_id     TEXT,
  artist_id    TEXT,
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_archive_user_listened
  ON logs_archive(user_id, listened_at DESC);

ALTER TABLE logs_archive DISABLE ROW LEVEL SECURITY;

-- Atomically move one batch of old logs to logs_archive.
-- DELETE FROM logs cascades to user_listening_aggregate_ingest automatically.
-- Idempotent: ON CONFLICT DO NOTHING skips rows already archived.
CREATE OR REPLACE FUNCTION archive_old_logs(
  p_cutoff_days INT DEFAULT 180,
  p_batch_size  INT DEFAULT 5000
)
RETURNS TABLE(archived INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_cutoff_days || ' days')::INTERVAL;
  v_count  INT;
BEGIN
  SET LOCAL statement_timeout = '120s';

  WITH to_archive AS (
    SELECT id FROM logs
    WHERE listened_at < v_cutoff
    ORDER BY listened_at ASC, id ASC
    LIMIT p_batch_size
  ),
  moved AS (
    INSERT INTO logs_archive
    SELECT l.*
    FROM logs l
    JOIN to_archive t ON t.id = l.id
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  DELETE FROM logs l
  USING moved m
  WHERE l.id = m.id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  archived := v_count;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION archive_old_logs(INT, INT) TO service_role;
