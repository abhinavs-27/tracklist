-- 015_logs_track_id_and_source.sql
-- Align logs with canonical schema: track_id, listened_at, source.
-- Rename columns and add source; update indexes.

-- Rename columns
ALTER TABLE logs RENAME COLUMN spotify_song_id TO track_id;
ALTER TABLE logs RENAME COLUMN played_at TO listened_at;

-- Add source (spotify | manual_import)
ALTER TABLE logs ADD COLUMN IF NOT EXISTS source TEXT;
UPDATE logs SET source = 'spotify' WHERE source IS NULL;
ALTER TABLE logs ALTER COLUMN source SET DEFAULT 'spotify';

-- Drop old unique constraint and create new one
ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_user_song_played_unique;
ALTER TABLE logs ADD CONSTRAINT logs_user_track_listened_unique
  UNIQUE (user_id, track_id, listened_at);

-- Replace track index: spotify_song_id -> track_id
DROP INDEX IF EXISTS idx_logs_song;
DROP INDEX IF EXISTS idx_logs_song_id;
CREATE INDEX IF NOT EXISTS idx_logs_track_id ON logs(track_id);

-- Rename played_at index to listened_at
DROP INDEX IF EXISTS idx_logs_played_at;
CREATE INDEX IF NOT EXISTS idx_logs_listened_at ON logs(listened_at DESC);

-- Ensure user_id index (011 may have created idx_logs_user)
CREATE INDEX IF NOT EXISTS idx_logs_user ON logs(user_id);
