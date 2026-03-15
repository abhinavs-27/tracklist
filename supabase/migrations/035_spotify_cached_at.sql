-- DB-first cache: when we last fetched this entity from Spotify (for TTL / refresh)
-- Backfill: existing rows get cached_at = updated_at so TTL applies correctly

ALTER TABLE artists ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ;
UPDATE artists SET cached_at = updated_at WHERE cached_at IS NULL;
ALTER TABLE artists ALTER COLUMN cached_at SET DEFAULT NOW();

ALTER TABLE albums ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ;
UPDATE albums SET cached_at = updated_at WHERE cached_at IS NULL;
ALTER TABLE albums ALTER COLUMN cached_at SET DEFAULT NOW();

ALTER TABLE songs ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ;
UPDATE songs SET cached_at = updated_at WHERE cached_at IS NULL;
ALTER TABLE songs ALTER COLUMN cached_at SET DEFAULT NOW();
