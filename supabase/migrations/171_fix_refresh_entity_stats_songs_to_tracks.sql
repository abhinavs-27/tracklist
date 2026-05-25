-- Migration 171: fix refresh_entity_stats — migration 158 introduced `songs`
-- but the table is named `tracks`. Replace all three occurrences.

CREATE OR REPLACE FUNCTION refresh_entity_stats(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  v_since := COALESCE(p_since, NOW() - INTERVAL '25 hours');

  -- Album stats: only albums that had a new listen or review since v_since
  INSERT INTO album_stats (album_id, avg_rating, review_count, listen_count, rating_distribution, last_updated)
  SELECT
    a.album_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    COALESCE(r.rating_distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb),
    NOW()
  FROM (
    -- Active albums: those with a recent log or a recent review
    SELECT DISTINCT t.album_id
    FROM logs l
    JOIN tracks t ON t.id = l.track_id
    WHERE t.album_id IS NOT NULL
      AND l.listened_at >= v_since
    UNION
    SELECT DISTINCT entity_id AS album_id
    FROM reviews
    WHERE entity_type = 'album'
      AND entity_id IS NOT NULL
      AND created_at >= v_since
  ) a
  LEFT JOIN (
    SELECT
      entity_id AS album_id,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*)::int AS review_count,
      jsonb_build_object(
        '1', COUNT(*) FILTER (WHERE rating = 1),
        '2', COUNT(*) FILTER (WHERE rating = 2),
        '3', COUNT(*) FILTER (WHERE rating = 3),
        '4', COUNT(*) FILTER (WHERE rating = 4),
        '5', COUNT(*) FILTER (WHERE rating = 5)
      ) AS rating_distribution
    FROM reviews
    WHERE entity_type = 'album'
    GROUP BY entity_id
  ) r ON r.album_id = a.album_id
  LEFT JOIN (
    SELECT t.album_id, COUNT(l.id)::int AS listen_count
    FROM logs l
    JOIN tracks t ON t.id = l.track_id
    WHERE t.album_id IS NOT NULL
    GROUP BY t.album_id
  ) l ON l.album_id = a.album_id
  ON CONFLICT (album_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    rating_distribution = EXCLUDED.rating_distribution,
    last_updated = NOW();

  -- Track stats: only tracks that had a new listen or review since v_since
  INSERT INTO track_stats (track_id, avg_rating, review_count, listen_count, last_updated)
  SELECT
    t.track_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    NOW()
  FROM (
    -- Active tracks: those with a recent log or a recent review
    SELECT DISTINCT track_id
    FROM logs
    WHERE track_id IS NOT NULL
      AND listened_at >= v_since
    UNION
    SELECT DISTINCT entity_id AS track_id
    FROM reviews
    WHERE entity_type = 'song'
      AND entity_id IS NOT NULL
      AND created_at >= v_since
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
