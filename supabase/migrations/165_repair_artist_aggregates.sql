-- migration 165: repair missing artist rows in user_listening_aggregates
--
-- Root cause: Last.fm ingest always inserts logs with artist_id = null and album_id = null.
-- When the listening-aggregates cron processes a log before Spotify enrichment completes,
-- tracks.artist_id may be null while tracks.album_id is already set. The delta pipeline
-- increments the album aggregate but silently drops the artist increment (artistId = null).
-- The log is then marked as processed and never retried, leaving a permanent gap.
--
-- p_user_id: when provided, repairs only that user (no row limit applied).
--            when NULL, repairs all users up to p_limit rows of album aggregates.
-- Idempotent: inserts only where the artist row is completely missing.

CREATE OR REPLACE FUNCTION repair_missing_artist_aggregates(
  p_limit   INT  DEFAULT 50000,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(inserted_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BIGINT := 0;
  v_limit    INT    := CASE WHEN p_user_id IS NOT NULL THEN 2147483647 ELSE p_limit END;
BEGIN
  WITH album_agg AS (
    SELECT
      ula.user_id,
      ula.entity_id   AS album_id,
      al.artist_id,
      ula.count,
      ula.week_start,
      ula.month,
      ula.year
    FROM user_listening_aggregates ula
    JOIN albums al
      ON al.id::text = ula.entity_id
     AND al.artist_id IS NOT NULL
    WHERE ula.entity_type = 'album'
      AND (p_user_id IS NULL OR ula.user_id = p_user_id)
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT
      aa.user_id,
      'artist',
      aa.artist_id::text,
      aa.count,
      aa.week_start,
      aa.month,
      aa.year
    FROM album_agg aa
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_listening_aggregates x
      WHERE x.user_id      = aa.user_id
        AND x.entity_type  = 'artist'
        AND x.entity_id    = aa.artist_id::text
        AND x.week_start   IS NOT DISTINCT FROM aa.week_start
        AND x.month        IS NOT DISTINCT FROM aa.month
        AND x.year         IS NOT DISTINCT FROM aa.year
    )
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN QUERY SELECT v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_missing_artist_aggregates(INT, UUID) TO service_role;
