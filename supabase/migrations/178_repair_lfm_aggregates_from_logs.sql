-- Repair missing artist/album/genre aggregate rows for logs that were processed
-- before Spotify enrichment ran (i.e., when tracks.artist_id / album_id were null).
--
-- The main aggregate pipeline marks each log in user_listening_aggregate_ingest
-- and never re-processes it. When a log's track had no artist_id at ingest time,
-- only a "track" aggregate row was written. After Spotify enrichment fills in
-- tracks.artist_id and tracks.album_id, this function back-fills the missing
-- artist, album, and genre rows by re-joining from logs → tracks → artists.
--
-- Safe to run repeatedly: ON CONFLICT DO NOTHING prevents double-counting.
-- Must be run AFTER Spotify enrichment has populated tracks.artist_id / album_id.

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
  SET LOCAL statement_timeout = '15 minutes';

  -- ── Artist rows ───────────────────────────────────────────────────────────
  -- For every processed log whose track now has an artist_id, compute counts
  -- per (user, artist, bucket) and insert missing rows.
  WITH enriched AS (
    SELECT
      l.user_id,
      t.artist_id::text AS entity_id,
      l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
  ),
  buckets AS (
    SELECT user_id, entity_id,
      date_trunc('week', listened_at AT TIME ZONE 'UTC')::date AS week_start,
      NULL::date AS month, NULL::int AS year,
      COUNT(*)::int AS cnt
    FROM enriched
    GROUP BY user_id, entity_id, date_trunc('week', listened_at AT TIME ZONE 'UTC')

    UNION ALL

    SELECT user_id, entity_id,
      NULL::date,
      date_trunc('month', listened_at AT TIME ZONE 'UTC')::date AS month,
      NULL::int, COUNT(*)::int
    FROM enriched
    GROUP BY user_id, entity_id, date_trunc('month', listened_at AT TIME ZONE 'UTC')

    UNION ALL

    SELECT user_id, entity_id,
      NULL::date, NULL::date,
      EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')::int AS year,
      COUNT(*)::int
    FROM enriched
    GROUP BY user_id, entity_id, EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')
  ),
  ins AS (
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'artist', entity_id, cnt, week_start, month, year
    FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_artist FROM ins;

  -- ── Album rows ────────────────────────────────────────────────────────────
  WITH enriched AS (
    SELECT
      l.user_id,
      t.album_id::text AS entity_id,
      l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.album_id IS NOT NULL
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
  ),
  buckets AS (
    SELECT user_id, entity_id,
      date_trunc('week', listened_at AT TIME ZONE 'UTC')::date AS week_start,
      NULL::date AS month, NULL::int AS year,
      COUNT(*)::int AS cnt
    FROM enriched
    GROUP BY user_id, entity_id, date_trunc('week', listened_at AT TIME ZONE 'UTC')

    UNION ALL

    SELECT user_id, entity_id,
      NULL::date,
      date_trunc('month', listened_at AT TIME ZONE 'UTC')::date,
      NULL::int, COUNT(*)::int
    FROM enriched
    GROUP BY user_id, entity_id, date_trunc('month', listened_at AT TIME ZONE 'UTC')

    UNION ALL

    SELECT user_id, entity_id,
      NULL::date, NULL::date,
      EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')::int,
      COUNT(*)::int
    FROM enriched
    GROUP BY user_id, entity_id, EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')
  ),
  ins AS (
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'album', entity_id, cnt, week_start, month, year
    FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_album FROM ins;

  -- ── Genre rows ────────────────────────────────────────────────────────────
  -- Join through to artists.genres to compute genre-level listen counts.
  -- Capped to MAX_GENRES_PER_LOG (5) per listen to match the live pipeline.
  WITH enriched AS (
    SELECT
      l.user_id,
      lower(trim(genre_name)) AS entity_id,
      l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL
    JOIN artists ar ON ar.id = t.artist_id
    CROSS JOIN LATERAL (
      SELECT genre_val
      FROM UNNEST(ar.genres[1:5]) AS g(genre_val)
      WHERE g.genre_val IS NOT NULL AND trim(g.genre_val) <> ''
    ) genres(genre_name)
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)
  ),
  buckets AS (
    SELECT user_id, entity_id,
      date_trunc('week', listened_at AT TIME ZONE 'UTC')::date AS week_start,
      NULL::date AS month, NULL::int AS year,
      COUNT(*)::int AS cnt
    FROM enriched
    GROUP BY user_id, entity_id, date_trunc('week', listened_at AT TIME ZONE 'UTC')

    UNION ALL

    SELECT user_id, entity_id,
      NULL::date,
      date_trunc('month', listened_at AT TIME ZONE 'UTC')::date,
      NULL::int, COUNT(*)::int
    FROM enriched
    GROUP BY user_id, entity_id, date_trunc('month', listened_at AT TIME ZONE 'UTC')

    UNION ALL

    SELECT user_id, entity_id,
      NULL::date, NULL::date,
      EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')::int,
      COUNT(*)::int
    FROM enriched
    GROUP BY user_id, entity_id, EXTRACT(YEAR FROM listened_at AT TIME ZONE 'UTC')
  ),
  ins AS (
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    SELECT user_id, 'genre', entity_id, cnt, week_start, month, year
    FROM buckets
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_genre FROM ins;

  RETURN QUERY SELECT v_artist, v_album, v_genre;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_lfm_aggregates_from_logs(UUID) TO service_role;
