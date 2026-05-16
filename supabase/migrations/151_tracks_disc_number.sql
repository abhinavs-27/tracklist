-- Add disc_number to tracks so multi-disc albums sort correctly.
-- Spotify's track_number restarts at 1 for each disc, so ordering by
-- track_number alone interleaves tracks across discs.

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS disc_number smallint NOT NULL DEFAULT 1;

-- Backfill: existing rows default to disc 1 which is correct for single-disc
-- albums; multi-disc albums will be re-fetched from Spotify on next cache miss.

COMMENT ON COLUMN tracks.disc_number IS
  'Disc number within the album (1-indexed). Spotify track_number restarts per disc.';
