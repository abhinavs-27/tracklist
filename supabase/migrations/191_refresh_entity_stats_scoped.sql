-- 191_refresh_entity_stats_scoped.sql
--
-- Fix: refresh_entity_stats() aggregated the ENTIRE logs/reviews tables on every
-- run (GROUP BY over all ~440k logs -> counts for all ~32k albums / ~73k tracks),
-- then joined to the tiny active set (a few hundred entities touched in the last
-- 25h). Runtime had grown to ~27-31s and exceeded the service_role 30s statement
-- timeout, so the daily REFRESH_STATS job failed and the rest of its chain
-- (favorite counts, discover MVs, precomputed caches) never ran.
--
-- This rewrite scopes the listen/rating aggregations to the active entity set only,
-- producing identical per-entity results at a fraction of the cost, and sets a
-- generous function-level statement_timeout as a safety margin against cold-cache
-- spikes and future growth. No behavioral change to the stats themselves.

CREATE OR REPLACE FUNCTION public.refresh_entity_stats(
  p_since timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '240s'
AS $function$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  v_since := COALESCE(p_since, NOW() - INTERVAL '25 hours');

  -- ===== Album stats: only albums with a new listen or review since v_since =====
  WITH active AS MATERIALIZED (
    SELECT DISTINCT t.album_id AS album_id
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
  ),
  rat AS (
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
      AND entity_id IN (SELECT album_id FROM active)
    GROUP BY entity_id
  ),
  lis AS (
    SELECT t.album_id, COUNT(l.id)::int AS listen_count
    FROM logs l
    JOIN tracks t ON t.id = l.track_id
    WHERE t.album_id IN (SELECT album_id FROM active)
    GROUP BY t.album_id
  )
  INSERT INTO album_stats (album_id, avg_rating, review_count, listen_count, rating_distribution, last_updated)
  SELECT
    a.album_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    COALESCE(r.rating_distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb),
    NOW()
  FROM active a
  LEFT JOIN rat r ON r.album_id = a.album_id
  LEFT JOIN lis l ON l.album_id = a.album_id
  ON CONFLICT (album_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    rating_distribution = EXCLUDED.rating_distribution,
    last_updated = NOW();

  -- ===== Track stats: only tracks with a new listen or review since v_since =====
  WITH active AS MATERIALIZED (
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
  ),
  rat AS (
    SELECT
      entity_id AS track_id,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*)::int AS review_count
    FROM reviews
    WHERE entity_type = 'song'
      AND entity_id IN (SELECT track_id FROM active)
    GROUP BY entity_id
  ),
  lis AS (
    SELECT track_id, COUNT(*)::int AS listen_count
    FROM logs
    WHERE track_id IN (SELECT track_id FROM active)
    GROUP BY track_id
  )
  INSERT INTO track_stats (track_id, avg_rating, review_count, listen_count, last_updated)
  SELECT
    t.track_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    NOW()
  FROM active t
  LEFT JOIN rat r ON r.track_id = t.track_id
  LEFT JOIN lis l ON l.track_id = t.track_id
  ON CONFLICT (track_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    last_updated = NOW();
END;
$function$;
