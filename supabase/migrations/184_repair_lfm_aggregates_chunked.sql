-- Chunked variant of repair_lfm_aggregates_from_logs.
--
-- The original function scans all 434k rows in user_listening_aggregate_ingest
-- for every call (no user_id column on that table), which exceeds Supabase's
-- 2-minute PostgREST statement timeout even when scoped to one user.
--
-- This function processes a fixed-size WINDOW of ingest rows ordered by log_id
-- (the PK), making each call O(chunk_size) instead of O(total_ingest_rows).
-- The caller loops with the returned next_cursor until it is NULL.
--
-- Parameters:
--   p_chunk_size   — rows of user_listening_aggregate_ingest per call (default 5000)
--   p_after_log_id — cursor from the previous call; NULL to start from the beginning

CREATE OR REPLACE FUNCTION repair_lfm_aggregates_chunk(
  p_chunk_size   INT  DEFAULT 5000,
  p_after_log_id UUID DEFAULT NULL
)
RETURNS TABLE(
  artist_rows  BIGINT,
  album_rows   BIGINT,
  genre_rows   BIGINT,
  next_cursor  UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist      BIGINT := 0;
  v_album       BIGINT := 0;
  v_genre       BIGINT := 0;
  v_next_cursor UUID;
  v_chunk_count INT;
BEGIN
  -- Grab the next chunk of ingest rows by PK order.
  -- Each call hits the PK index: O(chunk_size), not O(total_rows).
  -- DROP first so the function is safe when called multiple times in the same session.
  DROP TABLE IF EXISTS _repair_chunk;
  CREATE TEMP TABLE _repair_chunk ON COMMIT DROP AS
  SELECT log_id
  FROM user_listening_aggregate_ingest
  WHERE (p_after_log_id IS NULL OR log_id > p_after_log_id)
  ORDER BY log_id
  LIMIT p_chunk_size;

  GET DIAGNOSTICS v_chunk_count = ROW_COUNT;

  -- If no rows, we're done — return NULLs.
  IF v_chunk_count = 0 THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT, NULL::UUID;
    RETURN;
  END IF;

  SELECT log_id INTO v_next_cursor FROM _repair_chunk ORDER BY log_id DESC LIMIT 1;

  -- ── Artist rows ──────────────────────────────────────────────────────────
  WITH enriched AS (
    SELECT l.user_id, t.artist_id::text AS entity_id, l.listened_at
    FROM _repair_chunk c
    JOIN logs l ON l.id = c.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL

    UNION ALL

    SELECT l.user_id, a.id::text AS entity_id, l.listened_at
    FROM _repair_chunk c
    JOIN logs l ON l.id = c.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NULL AND t.lastfm_artist_name IS NOT NULL
    JOIN artists a ON a.name_normalized = lower(trim(t.lastfm_artist_name))
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
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'artist', entity_id, cnt, week_start, month, year FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_artist FROM ins;

  -- ── Album rows ───────────────────────────────────────────────────────────
  WITH enriched AS (
    SELECT l.user_id, t.album_id::text AS entity_id, l.listened_at
    FROM _repair_chunk c
    JOIN logs l ON l.id = c.log_id
    JOIN tracks t ON t.id = l.track_id AND t.album_id IS NOT NULL
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
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'album', entity_id, cnt, week_start, month, year FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_album FROM ins;

  -- ── Genre rows ───────────────────────────────────────────────────────────
  WITH enriched AS (
    SELECT l.user_id, lower(trim(genre_name)) AS entity_id, l.listened_at
    FROM _repair_chunk c
    JOIN logs l ON l.id = c.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL
    JOIN artists ar ON ar.id = t.artist_id
    CROSS JOIN LATERAL (
      SELECT genre_val FROM UNNEST(ar.genres[1:5]) AS g(genre_val)
      WHERE g.genre_val IS NOT NULL AND trim(g.genre_val) <> ''
    ) genres(genre_name)

    UNION ALL

    SELECT l.user_id, lower(trim(genre_name)) AS entity_id, l.listened_at
    FROM _repair_chunk c
    JOIN logs l ON l.id = c.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NULL AND t.lastfm_artist_name IS NOT NULL
    JOIN artists ar ON ar.name_normalized = lower(trim(t.lastfm_artist_name))
    CROSS JOIN LATERAL (
      SELECT genre_val FROM UNNEST(ar.genres[1:5]) AS g(genre_val)
      WHERE g.genre_val IS NOT NULL AND trim(g.genre_val) <> ''
    ) genres(genre_name)
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
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'genre', entity_id, cnt, week_start, month, year FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_genre FROM ins;

  -- Return NULL as next_cursor if this was the last chunk (fewer rows than requested).
  IF v_chunk_count < p_chunk_size THEN
    v_next_cursor := NULL;
  END IF;

  RETURN QUERY SELECT v_artist, v_album, v_genre, v_next_cursor;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_lfm_aggregates_chunk(INT, UUID) TO service_role;
