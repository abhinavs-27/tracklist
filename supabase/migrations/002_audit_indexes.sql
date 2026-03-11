-- Migration 002: Feed and comments indexes (audit)
-- Safe to run on existing DBs. Uses IF NOT EXISTS.

-- In case logs was created before title existed
ALTER TABLE logs ADD COLUMN IF NOT EXISTS title TEXT;

-- Composite index for feed: logs from followed users ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_logs_user_created ON logs(user_id, created_at DESC);

-- Comments: index for ordering by created_at per log
CREATE INDEX IF NOT EXISTS idx_comments_log_created ON comments(log_id, created_at);
