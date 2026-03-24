-- Speeds up ORDER BY updated_at (e.g. metadata backfill cron).
CREATE INDEX IF NOT EXISTS idx_artists_updated_at ON artists (updated_at);
