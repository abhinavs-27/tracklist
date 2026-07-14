-- 194_cooccurrence_prune_topn.sql
-- Bound media_cooccurrence so it stops growing without limit.
--
-- Background: compute_{song,album}_cooccurrence_in_db (migration 162) are pure
-- INSERT ... ON CONFLICT DO UPDATE — they refresh current pairs but NEVER delete.
-- Two failure modes accumulated ~1GB / 3M rows before a manual prune on 2026-07-13:
--   1. Per-seed fan-out: every pair with count>=2 was stored (avg 202, up to 2726
--      related items per seed) even though the read path (lib/discovery/getRelatedMedia.ts)
--      only ever uses the top 20 by score.
--   2. Cross-run drift: pairs that dropped out of the rolling 90-day window (or fell
--      below a seed's kept set) kept their old rows forever.
--
-- Fix, two parts:
--   (a) Cap the INSERT to the top 50 pairs per seed (generous vs the 20 actually read).
--       Ranking by COUNT(*) DESC is equivalent to score DESC (score = count / max_count
--       within the seed), so this keeps exactly the highest-signal pairs.
--   (b) run_compute_cooccurrence() deletes any row not refreshed by the current run,
--       clearing dropped pairs and dropped seeds. now() is the transaction timestamp,
--       so every row (re)written above carries updated_at = v_run_start and is kept;
--       anything older is stale and removed.

CREATE OR REPLACE FUNCTION compute_song_cooccurrence_in_db(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(pairs_written INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since    DATE        := COALESCE(p_since::date, CURRENT_DATE - INTERVAL '90 days');
  v_written  INT;
BEGIN
  SET LOCAL statement_timeout = '300s';

  -- Collapse per-user repeat listens into one row per (user, track) before joining.
  -- This turns an O(listens²) self-join into O(unique_tracks_per_user²).
  WITH user_tracks AS (
    SELECT user_id, entity_id
    FROM user_listening_aggregates
    WHERE entity_type = 'track'
      AND week_start IS NOT NULL
      AND week_start >= v_since
    GROUP BY user_id, entity_id
  ),
  ranked AS (
    SELECT
      a.entity_id AS content_id,
      b.entity_id AS related_content_id,
      COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.entity_id), 0) AS score,
      ROW_NUMBER() OVER (PARTITION BY a.entity_id ORDER BY COUNT(*) DESC, b.entity_id) AS rn
    FROM user_tracks a
    JOIN user_tracks b
      ON  a.user_id   = b.user_id
      AND a.entity_id < b.entity_id
    GROUP BY a.entity_id, b.entity_id
    HAVING COUNT(*) >= 2
  )
  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT 'song', content_id, related_content_id, score, NOW()
  FROM ranked
  WHERE rn <= 50   -- keep only the top-50 related items per seed
  ON CONFLICT (content_type, content_id, related_content_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    updated_at = NOW();

  GET DIAGNOSTICS v_written = ROW_COUNT;
  pairs_written := v_written;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION compute_album_cooccurrence_in_db(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(pairs_written INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since    DATE        := COALESCE(p_since::date, CURRENT_DATE - INTERVAL '90 days');
  v_written  INT;
BEGIN
  SET LOCAL statement_timeout = '300s';

  WITH user_albums AS (
    SELECT user_id, entity_id
    FROM user_listening_aggregates
    WHERE entity_type = 'album'
      AND week_start IS NOT NULL
      AND week_start >= v_since
    GROUP BY user_id, entity_id
  ),
  ranked AS (
    SELECT
      a.entity_id AS content_id,
      b.entity_id AS related_content_id,
      COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.entity_id), 0) AS score,
      ROW_NUMBER() OVER (PARTITION BY a.entity_id ORDER BY COUNT(*) DESC, b.entity_id) AS rn
    FROM user_albums a
    JOIN user_albums b
      ON  a.user_id   = b.user_id
      AND a.entity_id < b.entity_id
    GROUP BY a.entity_id, b.entity_id
    HAVING COUNT(*) >= 2
  )
  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT 'album', content_id, related_content_id, score, NOW()
  FROM ranked
  WHERE rn <= 50   -- keep only the top-50 related items per seed
  ON CONFLICT (content_type, content_id, related_content_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    updated_at = NOW();

  GET DIAGNOSTICS v_written = ROW_COUNT;
  pairs_written := v_written;
  RETURN NEXT;
END;
$$;

-- Wrapper (from 193) + stale-row prune. Deletes every pair not refreshed by this run.
CREATE OR REPLACE FUNCTION public.run_compute_cooccurrence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_start TIMESTAMPTZ := now();  -- transaction timestamp; == the NOW() written below
BEGIN
  PERFORM compute_song_cooccurrence_in_db();
  PERFORM compute_album_cooccurrence_in_db();

  -- Rows (re)written above carry updated_at = v_run_start and are kept; anything with an
  -- older timestamp is a pair/seed that dropped out of the current window → remove it.
  DELETE FROM media_cooccurrence WHERE updated_at < v_run_start;
END;
$function$;

GRANT EXECUTE ON FUNCTION compute_song_cooccurrence_in_db(TIMESTAMPTZ)  TO service_role;
GRANT EXECUTE ON FUNCTION compute_album_cooccurrence_in_db(TIMESTAMPTZ) TO service_role;
