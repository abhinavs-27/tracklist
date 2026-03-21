-- Last successful Last.fm cron sync (watermark for background import).

ALTER TABLE users ADD COLUMN IF NOT EXISTS lastfm_last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN users.lastfm_last_synced_at IS 'Last time daily Last.fm scrobble sync ran for this user';
