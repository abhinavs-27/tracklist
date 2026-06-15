-- Repair functions can take several minutes on large aggregates tables.
-- The default Supabase statement timeout (30s) is too short.
-- SET LOCAL inside plpgsql applies for the duration of the function's transaction.

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
  SET LOCAL statement_timeout = '10 minutes';

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

CREATE OR REPLACE FUNCTION repair_orphaned_artist_aggregates(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(merged_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merged BIGINT := 0;
  rec RECORD;
BEGIN
  SET LOCAL statement_timeout = '10 minutes';

  FOR rec IN (
    SELECT DISTINCT ON (ula.id)
      ula.id        AS orphan_id,
      ula.user_id,
      ula.count,
      ula.week_start,
      ula.month,
      ula.year,
      al.artist_id::text AS winner_id
    FROM user_listening_aggregates ula
    JOIN user_listening_aggregates album_agg
      ON album_agg.user_id    = ula.user_id
     AND album_agg.entity_type = 'album'
     AND album_agg.week_start  IS NOT DISTINCT FROM ula.week_start
     AND album_agg.month       IS NOT DISTINCT FROM ula.month
     AND album_agg.year        IS NOT DISTINCT FROM ula.year
    JOIN albums al
      ON al.id::text = album_agg.entity_id
     AND al.artist_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM artists a WHERE a.id = al.artist_id)
    WHERE ula.entity_type = 'artist'
      AND (p_user_id IS NULL OR ula.user_id = p_user_id)
      AND NOT EXISTS (SELECT 1 FROM artists a WHERE a.id::text = ula.entity_id)
    ORDER BY ula.id, album_agg.count DESC
  )
  LOOP
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    VALUES
      (rec.user_id, 'artist', rec.winner_id, rec.count, rec.week_start, rec.month, rec.year)
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET
      count      = user_listening_aggregates.count + EXCLUDED.count,
      updated_at = now();

    DELETE FROM user_listening_aggregates WHERE id = rec.orphan_id;

    v_merged := v_merged + 1;
  END LOOP;

  RETURN QUERY SELECT v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_orphaned_artist_aggregates(UUID) TO service_role;
