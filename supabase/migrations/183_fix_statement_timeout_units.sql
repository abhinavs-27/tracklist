-- Fix invalid statement_timeout values in repair functions.
-- PostgreSQL SET LOCAL accepts 'min' not 'minutes' as the unit.
-- Affects: resolve_track_artist_ids_from_name, repair_lfm_aggregates_from_logs,
--          repair_missing_artist_aggregates, repair_orphaned_artist_aggregates.
-- This migration re-applies the full function bodies with corrected timeout strings.

CREATE OR REPLACE FUNCTION resolve_track_artist_ids_from_name(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(tracks_updated BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BIGINT := 0;
BEGIN
  SET LOCAL statement_timeout = '10min';

  WITH resolved AS (
    UPDATE tracks
    SET
      artist_id  = sub.artist_id,
      updated_at = now()
    FROM (
      SELECT
        t.id AS track_id,
        (
          SELECT a.id
          FROM artists a
          WHERE a.name_normalized = lower(trim(t.lastfm_artist_name))
          LIMIT 1
        ) AS artist_id
      FROM tracks t
      WHERE t.artist_id IS NULL
        AND t.lastfm_artist_name IS NOT NULL
        AND (
          p_user_id IS NULL
          OR t.id IN (
            SELECT DISTINCT l.track_id
            FROM logs l
            WHERE l.user_id = p_user_id
              AND l.track_id IS NOT NULL
          )
        )
    ) sub
    WHERE tracks.id = sub.track_id
      AND sub.artist_id IS NOT NULL
    RETURNING tracks.id
  )
  SELECT COUNT(*) INTO v_updated FROM resolved;

  RETURN QUERY SELECT v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_track_artist_ids_from_name(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION repair_lfm_aggregates_from_logs(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(artist_rows BIGINT, album_rows BIGINT, genre_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist BIGINT := 0;
  v_album  BIGINT := 0;
  v_genre  BIGINT := 0;
BEGIN
  SET LOCAL statement_timeout = '15min';

  WITH enriched AS (
    SELECT l.user_id, t.artist_id::text AS entity_id, l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
    UNION ALL
    SELECT l.user_id, a.id::text AS entity_id, l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NULL AND t.lastfm_artist_name IS NOT NULL
    JOIN artists a ON a.name_normalized = lower(trim(t.lastfm_artist_name))
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
  ),
  buckets AS (
    SELECT user_id, entity_id,
      date_trunc('week', listened_at AT TIME ZONE 'UTC')::date AS week_start,
      NULL::date AS month, NULL::int AS year, COUNT(*)::int AS cnt
    FROM enriched GROUP BY user_id, entity_id, date_trunc('week', listened_at AT TIME ZONE 'UTC')
    UNION ALL
    SELECT user_id, entity_id, NULL::date,
      date_trunc('month', listened_at AT TIME ZONE 'UTC')::date, NULL::int, COUNT(*)::int
    FROM enriched GROUP BY user_id, entity_id, date_trunc('month', listened_at AT TIME ZONE 'UTC')
    UNION ALL
    SELECT user_id, entity_id, NULL::date, NULL::date,
      EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')::int, COUNT(*)::int
    FROM enriched GROUP BY user_id, entity_id, EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')
  ),
  ins AS (
    INSERT INTO user_listening_aggregates (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'artist', entity_id, cnt, week_start, month, year FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_artist FROM ins;

  WITH enriched AS (
    SELECT l.user_id, t.album_id::text AS entity_id, l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.album_id IS NOT NULL
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
  ),
  buckets AS (
    SELECT user_id, entity_id,
      date_trunc('week', listened_at AT TIME ZONE 'UTC')::date AS week_start,
      NULL::date AS month, NULL::int AS year, COUNT(*)::int AS cnt
    FROM enriched GROUP BY user_id, entity_id, date_trunc('week', listened_at AT TIME ZONE 'UTC')
    UNION ALL
    SELECT user_id, entity_id, NULL::date,
      date_trunc('month', listened_at AT TIME ZONE 'UTC')::date, NULL::int, COUNT(*)::int
    FROM enriched GROUP BY user_id, entity_id, date_trunc('month', listened_at AT TIME ZONE 'UTC')
    UNION ALL
    SELECT user_id, entity_id, NULL::date, NULL::date,
      EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')::int, COUNT(*)::int
    FROM enriched GROUP BY user_id, entity_id, EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')
  ),
  ins AS (
    INSERT INTO user_listening_aggregates (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'album', entity_id, cnt, week_start, month, year FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_album FROM ins;

  WITH enriched AS (
    SELECT l.user_id, lower(trim(genre_name)) AS entity_id, l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL
    JOIN artists ar ON ar.id = t.artist_id
    CROSS JOIN LATERAL (
      SELECT genre_val FROM UNNEST(ar.genres[1:5]) AS g(genre_val)
      WHERE g.genre_val IS NOT NULL AND trim(g.genre_val) <> ''
    ) genres(genre_name)
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
    UNION ALL
    SELECT l.user_id, lower(trim(genre_name)) AS entity_id, l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NULL AND t.lastfm_artist_name IS NOT NULL
    JOIN artists ar ON ar.name_normalized = lower(trim(t.lastfm_artist_name))
    CROSS JOIN LATERAL (
      SELECT genre_val FROM UNNEST(ar.genres[1:5]) AS g(genre_val)
      WHERE g.genre_val IS NOT NULL AND trim(g.genre_val) <> ''
    ) genres(genre_name)
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
  ),
  buckets AS (
    SELECT user_id, entity_id,
      date_trunc('week', listened_at AT TIME ZONE 'UTC')::date AS week_start,
      NULL::date AS month, NULL::int AS year, COUNT(*)::int AS cnt
    FROM enriched GROUP BY user_id, entity_id, date_trunc('week', listened_at AT TIME ZONE 'UTC')
    UNION ALL
    SELECT user_id, entity_id, NULL::date,
      date_trunc('month', listened_at AT TIME ZONE 'UTC')::date, NULL::int, COUNT(*)::int
    FROM enriched GROUP BY user_id, entity_id, date_trunc('month', listened_at AT TIME ZONE 'UTC')
    UNION ALL
    SELECT user_id, entity_id, NULL::date, NULL::date,
      EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')::int, COUNT(*)::int
    FROM enriched GROUP BY user_id, entity_id, EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')
  ),
  ins AS (
    INSERT INTO user_listening_aggregates (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'genre', entity_id, cnt, week_start, month, year FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_genre FROM ins;

  RETURN QUERY SELECT v_artist, v_album, v_genre;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_lfm_aggregates_from_logs(UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────

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
  SET LOCAL statement_timeout = '10min';

  WITH album_agg AS (
    SELECT ula.user_id, ula.entity_id AS album_id, al.artist_id,
           ula.count, ula.week_start, ula.month, ula.year
    FROM user_listening_aggregates ula
    JOIN albums al ON al.id::text = ula.entity_id AND al.artist_id IS NOT NULL
    WHERE ula.entity_type = 'album'
      AND (p_user_id IS NULL OR ula.user_id = p_user_id)
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO user_listening_aggregates (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT aa.user_id, 'artist', aa.artist_id::text, aa.count, aa.week_start, aa.month, aa.year
    FROM album_agg aa
    WHERE NOT EXISTS (
      SELECT 1 FROM user_listening_aggregates x
      WHERE x.user_id     = aa.user_id
        AND x.entity_type = 'artist'
        AND x.entity_id   = aa.artist_id::text
        AND x.week_start  IS NOT DISTINCT FROM aa.week_start
        AND x.month       IS NOT DISTINCT FROM aa.month
        AND x.year        IS NOT DISTINCT FROM aa.year
    )
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN QUERY SELECT v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_missing_artist_aggregates(INT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────

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
  SET LOCAL statement_timeout = '10min';

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
      ON album_agg.user_id     = ula.user_id
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
    DO UPDATE SET count = user_listening_aggregates.count + EXCLUDED.count, updated_at = now();

    DELETE FROM user_listening_aggregates WHERE id = rec.orphan_id;
    v_merged := v_merged + 1;
  END LOOP;

  RETURN QUERY SELECT v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_orphaned_artist_aggregates(UUID) TO service_role;
