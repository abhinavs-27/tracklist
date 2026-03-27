-- Last.fm–primary ingestion: catalog columns + listens capture + nullable song FKs for pending rows.

-- --- artists ---
ALTER TABLE artists ADD COLUMN IF NOT EXISTS spotify_id TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastfm_name TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS needs_spotify_enrichment BOOLEAN;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS spotify_match_confidence REAL;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();

UPDATE artists SET data_source = 'spotify' WHERE data_source IS NULL;
UPDATE artists SET needs_spotify_enrichment = FALSE WHERE needs_spotify_enrichment IS NULL;
ALTER TABLE artists ALTER COLUMN data_source SET DEFAULT 'lastfm';
ALTER TABLE artists ALTER COLUMN needs_spotify_enrichment SET DEFAULT FALSE;

COMMENT ON COLUMN artists.spotify_id IS 'Resolved Spotify catalog id when id is a synthetic lfm:* key';
COMMENT ON COLUMN artists.lastfm_name IS 'Original Last.fm artist string when ingested before Spotify match';
COMMENT ON COLUMN artists.data_source IS 'spotify | lastfm | mixed';
COMMENT ON COLUMN artists.needs_spotify_enrichment IS 'Background worker should resolve Spotify metadata';

-- --- songs (tracks in app schema) ---
ALTER TABLE songs ADD COLUMN IF NOT EXISTS spotify_id TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lastfm_name TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lastfm_artist_name TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS data_source TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS needs_spotify_enrichment BOOLEAN;

UPDATE songs SET data_source = 'spotify' WHERE data_source IS NULL;
UPDATE songs SET needs_spotify_enrichment = FALSE WHERE needs_spotify_enrichment IS NULL;
ALTER TABLE songs ALTER COLUMN data_source SET DEFAULT 'lastfm';
ALTER TABLE songs ALTER COLUMN needs_spotify_enrichment SET DEFAULT FALSE;

ALTER TABLE songs ALTER COLUMN album_id DROP NOT NULL;
ALTER TABLE songs ALTER COLUMN artist_id DROP NOT NULL;

ALTER TABLE songs DROP CONSTRAINT IF EXISTS songs_lfm_pending_or_catalog_full;
ALTER TABLE songs ADD CONSTRAINT songs_lfm_pending_or_catalog_full CHECK (
  (album_id IS NOT NULL AND artist_id IS NOT NULL)
  OR (lastfm_name IS NOT NULL AND lastfm_artist_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_songs_lastfm_pair ON songs (lastfm_artist_name, lastfm_name)
  WHERE lastfm_name IS NOT NULL AND lastfm_artist_name IS NOT NULL;

COMMENT ON COLUMN songs.spotify_id IS 'Resolved Spotify track id when id is synthetic lfm:*';
COMMENT ON COLUMN songs.lastfm_artist_name IS 'Last.fm artist string for matching before enrichment';

-- --- listens (raw capture; logs remains the primary feed table with track_id) ---
CREATE TABLE IF NOT EXISTS listens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  track_name TEXT NOT NULL,
  spotify_track_id TEXT,
  source TEXT NOT NULL DEFAULT 'lastfm',
  listened_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS listens_user_artist_track_time
  ON listens(user_id, artist_name, track_name, listened_at);

CREATE INDEX IF NOT EXISTS listens_user_listened_at ON listens(user_id, listened_at DESC);
CREATE INDEX IF NOT EXISTS listens_needs_spotify
  ON listens(user_id, listened_at DESC)
  WHERE spotify_track_id IS NULL;

ALTER TABLE listens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listens_select_own" ON listens
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE listens IS 'Last.fm (and future) listen capture; spotify_track_id filled by enrichment';
