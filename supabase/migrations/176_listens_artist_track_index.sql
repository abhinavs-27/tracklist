-- Index for resolveTrackSpotifyJob's per-track listens update.
-- That query filters by (artist_name, track_name) without a user_id prefix, so the
-- existing unique index (user_id, artist_name, track_name, listened_at) cannot be used.
-- This partial index keeps it to an index scan instead of a seq scan over all 400k+ listens.
CREATE INDEX IF NOT EXISTS listens_artist_track_no_spotify
  ON public.listens (artist_name, track_name)
  WHERE spotify_track_id IS NULL;
