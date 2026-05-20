-- supabase/migrations/159_cooccurrence_sql.sql
-- Move co-occurrence computation from Node (fetch 100K rows, compute in memory)
-- to SQL self-join. Eliminates the 100K-row truncation at scale.

CREATE OR REPLACE FUNCTION compute_song_cooccurrence_in_db(
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(pairs_written INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since    TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '90 days');
  v_written  INT;
BEGIN
  SET LOCAL statement_timeout = '300s';

  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT
    'song',
    a.track_id::text,
    b.track_id::text,
    COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.track_id), 0),
    NOW()
  FROM logs a
  JOIN logs b
    ON  a.user_id  = b.user_id
    AND a.track_id < b.track_id
  WHERE a.listened_at >= v_since
    AND b.listened_at >= v_since
    AND a.track_id IS NOT NULL
    AND b.track_id IS NOT NULL
  GROUP BY a.track_id, b.track_id
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
  v_since    TIMESTAMPTZ := COALESCE(p_since, NOW() - INTERVAL '90 days');
  v_written  INT;
BEGIN
  SET LOCAL statement_timeout = '300s';

  INSERT INTO media_cooccurrence
    (content_type, content_id, related_content_id, score, updated_at)
  SELECT
    'album',
    a.album_id::text,
    b.album_id::text,
    COUNT(*)::float / NULLIF(MAX(COUNT(*)) OVER (PARTITION BY a.album_id), 0),
    NOW()
  FROM logs a
  JOIN logs b
    ON  a.user_id  = b.user_id
    AND a.album_id < b.album_id
  WHERE a.listened_at >= v_since
    AND b.listened_at >= v_since
    AND a.album_id IS NOT NULL
    AND b.album_id IS NOT NULL
  GROUP BY a.album_id, b.album_id
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

GRANT EXECUTE ON FUNCTION compute_song_cooccurrence_in_db(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION compute_album_cooccurrence_in_db(TIMESTAMPTZ) TO service_role;
