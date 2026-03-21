-- Optional denormalized context + optional rating/note for manual / suggested / session logs.

ALTER TABLE logs ADD COLUMN IF NOT EXISTS album_id TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS artist_id TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS rating SMALLINT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_rating_range;
ALTER TABLE logs ADD CONSTRAINT logs_rating_range CHECK (
  rating IS NULL OR (rating >= 1 AND rating <= 5)
);

COMMENT ON COLUMN logs.album_id IS 'Spotify album id (optional context for feed/stats)';
COMMENT ON COLUMN logs.artist_id IS 'Spotify artist id (optional context)';
COMMENT ON COLUMN logs.rating IS 'Optional 1–5 quick log rating';
COMMENT ON COLUMN logs.note IS 'Optional quick log note';
