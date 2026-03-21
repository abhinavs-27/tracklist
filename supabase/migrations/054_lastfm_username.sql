-- Optional Last.fm username for read-only scrobble import (no OAuth).

ALTER TABLE users ADD COLUMN IF NOT EXISTS lastfm_username TEXT;

COMMENT ON COLUMN users.lastfm_username IS 'Last.fm username for importing public scrobble history';
