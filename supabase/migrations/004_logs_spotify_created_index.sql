-- Migration 004: Index for spotify_id + created_at on logs
-- Safe to run multiple times (uses IF NOT EXISTS).
-- Optimizes queries like:
--   SELECT ... FROM logs
--   WHERE spotify_id = ?
--   ORDER BY created_at DESC
--   LIMIT N;

CREATE INDEX IF NOT EXISTS idx_logs_spotify_created
  ON logs(spotify_id, created_at DESC);

