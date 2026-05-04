-- Composite index for fast per-user per-artist play counts.
-- Used by: COUNT(*) FROM logs JOIN tracks WHERE user_id = ? AND track_id IN (artist's tracks)
-- CONCURRENTLY builds without locking the table — safe on production.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_logs_user_track
  ON logs (user_id, track_id);
