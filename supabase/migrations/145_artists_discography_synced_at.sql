-- Track when an artist's full Spotify discography was last synced.
-- Used by the artist page to decide whether to enqueue sync_artist_discography.

ALTER TABLE artists ADD COLUMN IF NOT EXISTS discography_synced_at TIMESTAMPTZ;
