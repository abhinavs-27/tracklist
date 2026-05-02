-- Add release_year to entity_stats for direct year filtering on the leaderboard.
-- Avoids the pattern of collecting thousands of album_ids and passing them to .in().

ALTER TABLE entity_stats ADD COLUMN IF NOT EXISTS release_year SMALLINT;

-- Populate for albums
UPDATE entity_stats es
SET release_year = CAST(LEFT(a.release_date, 4) AS SMALLINT)
FROM albums a
WHERE es.entity_id = a.id
  AND es.entity_type = 'album'
  AND a.release_date IS NOT NULL
  AND a.release_date ~ '^\d{4}';

-- Populate for songs (via their album)
UPDATE entity_stats es
SET release_year = CAST(LEFT(a.release_date, 4) AS SMALLINT)
FROM tracks t
JOIN albums a ON a.id = t.album_id
WHERE es.entity_id = t.id
  AND es.entity_type = 'song'
  AND a.release_date IS NOT NULL
  AND a.release_date ~ '^\d{4}';

CREATE INDEX IF NOT EXISTS idx_entity_stats_release_year
  ON entity_stats (entity_type, release_year)
  WHERE release_year IS NOT NULL;
