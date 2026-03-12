-- 010_logs_refactor.sql
-- Logs table is used only for passive song logs now.
-- We keep the existing schema from 001_initial_schema.sql and just ensure helpful indexes.

CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_spotify ON logs(spotify_id);

