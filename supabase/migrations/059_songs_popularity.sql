-- Spotify track popularity (0–100) for taste / discovery heuristics; backfilled lazily on upsert.

ALTER TABLE songs ADD COLUMN IF NOT EXISTS popularity SMALLINT;

COMMENT ON COLUMN songs.popularity IS 'Spotify popularity 0–100; NULL if unknown';
