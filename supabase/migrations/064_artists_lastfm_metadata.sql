-- Last.fm–backed genre enrichment (Spotify artist genres are unreliable / deprecated).

ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastfm_fetched_at TIMESTAMPTZ;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastfm_listeners BIGINT;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastfm_playcount BIGINT;

COMMENT ON COLUMN artists.lastfm_fetched_at IS 'When artist genres/stats were last fetched from Last.fm';
COMMENT ON COLUMN artists.lastfm_listeners IS 'Last.fm artist.listeners (best-effort)';
COMMENT ON COLUMN artists.lastfm_playcount IS 'Last.fm artist.playcount (best-effort)';
