-- supabase/migrations/162_cooccurrence_from_aggregates.sql
-- Switch co-occurrence source from raw logs to user_listening_aggregates.
--
-- Why: the log self-join is O(listens²) — at 40K users with heavy listeners
-- it becomes catastrophically slow. The aggregates table has one row per
-- (user, entity, week), so the CTE collapses repeat listens before the join.
-- At 40K users × 200 unique tracks / 90 days = ~8M CTE rows vs potentially
-- 100M+ log rows for the same window.
--
-- Behaviour change: co-occurrence is now based on unique (user, track) pairs
-- in the window rather than raw listen events. Signal quality is equivalent
-- or better (repeat listens don't artificially inflate pair counts).

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
  )
  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT
    'song',
    a.entity_id,
    b.entity_id,
    COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.entity_id), 0),
    NOW()
  FROM user_tracks a
  JOIN user_tracks b
    ON  a.user_id   = b.user_id
    AND a.entity_id < b.entity_id
  GROUP BY a.entity_id, b.entity_id
  HAVING COUNT(*) >= 2
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
  )
  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT
    'album',
    a.entity_id,
    b.entity_id,
    COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.entity_id), 0),
    NOW()
  FROM user_albums a
  JOIN user_albums b
    ON  a.user_id   = b.user_id
    AND a.entity_id < b.entity_id
  GROUP BY a.entity_id, b.entity_id
  HAVING COUNT(*) >= 2
  ON CONFLICT (content_type, content_id, related_content_id)
  DO UPDATE SET
    score      = EXCLUDED.score,
    updated_at = NOW();

  GET DIAGNOSTICS v_written = ROW_COUNT;
  pairs_written := v_written;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION compute_song_cooccurrence_in_db(TIMESTAMPTZ)  TO service_role;
GRANT EXECUTE ON FUNCTION compute_album_cooccurrence_in_db(TIMESTAMPTZ) TO service_role;
