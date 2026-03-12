-- Spotify recently played cache (avoids hitting Spotify API on every request)

CREATE TABLE IF NOT EXISTS spotify_recent_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  track_name TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT,
  album_image TEXT,
  played_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, track_id, played_at)
);

CREATE INDEX IF NOT EXISTS spotify_recent_tracks_user_played_idx
  ON spotify_recent_tracks(user_id, played_at DESC);

-- RLS: server uses service role to read/write; no anon policies needed.
ALTER TABLE spotify_recent_tracks ENABLE ROW LEVEL SECURITY;
