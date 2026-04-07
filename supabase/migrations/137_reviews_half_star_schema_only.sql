-- Reapply half-star schema if 136 failed before commit (e.g. rolled back after refresh)
-- or the DB never received 136. Fixes: invalid input syntax for type integer: "4.5".
-- Also fixes: cannot alter type of column used by mv_hidden_gems (drop MV first).

DROP MATERIALIZED VIEW IF EXISTS mv_hidden_gems CASCADE;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_half_steps;

ALTER TABLE reviews
  ALTER COLUMN rating TYPE NUMERIC(2, 1)
  USING rating::numeric(2, 1);

ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_half_steps CHECK (
    rating IN (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5)
  );

ALTER TABLE album_stats
  ALTER COLUMN rating_distribution SET DEFAULT
  '{"1":0,"1.5":0,"2":0,"2.5":0,"3":0,"3.5":0,"4":0,"4.5":0,"5":0}'::jsonb;

DROP FUNCTION IF EXISTS increment_entity_review_count(text, uuid, integer);

CREATE OR REPLACE FUNCTION increment_entity_review_count(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_rating NUMERIC
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

CREATE MATERIALIZED VIEW mv_hidden_gems AS
WITH review_stats AS (
  SELECT
    r.entity_id,
    r.entity_type,
    AVG(r.rating)::NUMERIC(3,2) AS avg_rating
  FROM reviews r
  WHERE r.entity_type IN ('album', 'song')
  GROUP BY r.entity_id, r.entity_type
  HAVING AVG(r.rating) >= 4
),
listen_counts AS (
  SELECT rs.entity_id, rs.entity_type, rs.avg_rating,
    (
      CASE WHEN rs.entity_type = 'song' THEN
        (SELECT COUNT(*)::BIGINT FROM logs WHERE track_id = rs.entity_id)
      ELSE
        (SELECT COUNT(*)::BIGINT FROM logs l INNER JOIN tracks s ON l.track_id = s.id WHERE s.album_id = rs.entity_id)
      END
    ) AS listen_count
  FROM review_stats rs
)
SELECT entity_id, entity_type, avg_rating, listen_count
FROM listen_counts
WHERE listen_count <= 50
ORDER BY avg_rating DESC, listen_count ASC
LIMIT 50;

CREATE UNIQUE INDEX idx_mv_hidden_gems_entity ON mv_hidden_gems (entity_id, entity_type);

CREATE OR REPLACE FUNCTION get_hidden_gems_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, avg_rating NUMERIC, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.entity_id::text, m.entity_type, m.avg_rating, m.listen_count
  FROM mv_hidden_gems m
  ORDER BY m.avg_rating DESC, m.listen_count ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION refresh_discover_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_trending_entities;
  REFRESH MATERIALIZED VIEW mv_rising_artists;
  REFRESH MATERIALIZED VIEW mv_hidden_gems;
END;
$$;
