-- 046_entity_stats.sql
-- Generic precomputed entity stats to avoid per-request aggregation on logs and reviews.
-- Used for songs, albums, and artists.

CREATE TABLE IF NOT EXISTS entity_stats (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('song', 'album', 'artist')),
  entity_id   TEXT NOT NULL,
  play_count    INTEGER NOT NULL DEFAULT 0,
  review_count  INTEGER NOT NULL DEFAULT 0,
  avg_rating    NUMERIC(3,1),
  favorite_count INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_stats_updated_at
  ON entity_stats (updated_at DESC);

ALTER TABLE entity_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_stats_select_all"
  ON entity_stats FOR SELECT
  USING (true);

-- Helpers to increment counts atomically. These are called via Supabase RPC from the app.

CREATE OR REPLACE FUNCTION increment_entity_play_count(
  p_entity_type TEXT,
  p_entity_id   TEXT
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  VALUES (p_entity_type, p_entity_id, 1, 0, NULL, 0, NOW())
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    play_count = entity_stats.play_count + 1,
    updated_at = NOW();
$$;

CREATE OR REPLACE FUNCTION increment_entity_review_count(
  p_entity_type TEXT,
  p_entity_id   TEXT,
  p_rating      INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  VALUES (p_entity_type, p_entity_id, 0, 1, p_rating, 0, NOW())
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    review_count = entity_stats.review_count + 1,
    avg_rating = ROUND(
      (
        COALESCE(entity_stats.avg_rating, p_rating)::numeric * GREATEST(entity_stats.review_count, 0)
        + p_rating
      ) / (GREATEST(entity_stats.review_count, 0) + 1),
      1
    ),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION increment_entity_favorite_count(
  p_entity_type TEXT,
  p_entity_id   TEXT
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  VALUES (p_entity_type, p_entity_id, 0, 0, NULL, 1, NOW())
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    favorite_count = entity_stats.favorite_count + 1,
    updated_at = NOW();
$$;

