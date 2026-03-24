-- Genres already exist on artists (009). Add popularity from Spotify (0–100).
-- Safe to run multiple times.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS popularity INTEGER;

COMMENT ON COLUMN artists.popularity IS 'Spotify artist popularity (0–100), nullable until fetched';
