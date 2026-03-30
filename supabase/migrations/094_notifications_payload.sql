-- Optional JSON for notification UIs (e.g. music recommendation title, image, album id for tracks).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payload JSONB;

COMMENT ON COLUMN notifications.payload IS 'Optional display metadata (e.g. recommendation title, image URL, albumId for track links).';
