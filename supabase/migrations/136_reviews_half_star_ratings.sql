-- Half-star ratings: 1, 1.5, …, 5 on reviews; album_stats distribution keys include .5 steps.

-- `mv_hidden_gems` stores a rule that references `reviews.rating`; drop before changing the column type.
DROP MATERIALIZED VIEW IF EXISTS mv_hidden_gems CASCADE;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;

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

CREATE OR REPLACE FUNCTION refresh_entity_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO album_stats (album_id, avg_rating, review_count, listen_count, rating_distribution, last_updated)
  SELECT
    a.album_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    COALESCE(
      r.rating_distribution,
      '{"1":0,"1.5":0,"2":0,"2.5":0,"3":0,"3.5":0,"4":0,"4.5":0,"5":0}'::jsonb
    ),
    NOW()
  FROM (
    SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL
    UNION
    SELECT DISTINCT entity_id FROM reviews
    WHERE entity_type = 'album' AND entity_id IS NOT NULL
  ) a
  LEFT JOIN (
    SELECT
      entity_id AS album_id,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*)::int AS review_count,
      jsonb_build_object(
        '1', COUNT(*) FILTER (WHERE rating = 1),
        '1.5', COUNT(*) FILTER (WHERE rating = 1.5),
        '2', COUNT(*) FILTER (WHERE rating = 2),
        '2.5', COUNT(*) FILTER (WHERE rating = 2.5),
        '3', COUNT(*) FILTER (WHERE rating = 3),
        '3.5', COUNT(*) FILTER (WHERE rating = 3.5),
        '4', COUNT(*) FILTER (WHERE rating = 4),
        '4.5', COUNT(*) FILTER (WHERE rating = 4.5),
        '5', COUNT(*) FILTER (WHERE rating = 5)
      ) AS rating_distribution
    FROM reviews
    WHERE entity_type = 'album'
    GROUP BY entity_id
  ) r ON r.album_id = a.album_id
  LEFT JOIN (
    SELECT s.album_id, COUNT(l.id)::int AS listen_count
    FROM logs l
    JOIN tracks s ON s.id = l.track_id
    WHERE s.album_id IS NOT NULL
    GROUP BY s.album_id
  ) l ON l.album_id = a.album_id
  ON CONFLICT (album_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    rating_distribution = EXCLUDED.rating_distribution,
    last_updated = NOW();

  INSERT INTO track_stats (track_id, avg_rating, review_count, listen_count, last_updated)
  SELECT
    t.track_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    NOW()
  FROM (
    SELECT DISTINCT track_id FROM logs WHERE track_id IS NOT NULL
    UNION
    SELECT DISTINCT entity_id FROM reviews
    WHERE entity_type = 'song' AND entity_id IS NOT NULL
  ) t
  LEFT JOIN (
    SELECT
      entity_id AS track_id,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*)::int AS review_count
    FROM reviews
    WHERE entity_type = 'song'
    GROUP BY entity_id
  ) r ON r.track_id = t.track_id
  LEFT JOIN (
    SELECT track_id, COUNT(*)::int AS listen_count
    FROM logs
    WHERE track_id IS NOT NULL
    GROUP BY track_id
  ) l ON l.track_id = t.track_id
  ON CONFLICT (track_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    last_updated = NOW();
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

SELECT refresh_entity_stats();
