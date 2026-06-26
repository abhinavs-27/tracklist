-- Marker: when MusicBrainz last attempted to fill this album's release_date
-- (set on both match and no-match) so resumes skip already-tried albums.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS mb_date_checked_at timestamptz;
