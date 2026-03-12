-- Add album_id to recent tracks so we can derive "recent albums" from the same cache
ALTER TABLE spotify_recent_tracks
  ADD COLUMN IF NOT EXISTS album_id TEXT;
