-- Extend repair_lfm_aggregates_from_logs with a name-join fallback path.
--
-- The primary path (unchanged) covers tracks where artist_id IS NOT NULL.
-- The fallback path covers tracks that still have artist_id IS NULL but where
-- lastfm_artist_name matches an artists row by name_normalized — i.e. the artist
-- exists in the catalog but resolve_track_artist_ids_from_name() hasn't updated
-- the track yet (e.g. the track was imported between the resolve step and this repair).
--
-- ON CONFLICT DO NOTHING ensures no double-counting between the two paths.

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

  -- ── Artist rows (primary: artist_id FK already set) ───────────────────────
  WITH enriched AS (
    SELECT
      l.user_id,
      t.artist_id::text AS entity_id,
      l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NOT NULL
    WHERE (p_user_id IS NULL OR l.user_id = p_user_id)

    UNION ALL

    -- Fallback: artist_id IS NULL but lastfm_artist_name resolves by name
    SELECT
      l.user_id,
      a.id::text AS entity_id,
      l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NULL AND t.lastfm_artist_name IS NOT NULL
    JOIN artists a ON a.name_normalized = lower(trim(t.lastfm_artist_name))
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

  -- ── Album rows (unchanged — requires album_id IS NOT NULL) ────────────────
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

  -- ── Genre rows (primary + fallback, same pattern as artist) ──────────────
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

    UNION ALL

    -- Fallback: artist_id IS NULL, resolve artist by name to get genres
    SELECT
      l.user_id,
      lower(trim(genre_name)) AS entity_id,
      l.listened_at
    FROM user_listening_aggregate_ingest uai
    JOIN logs l ON l.id = uai.log_id
    JOIN tracks t ON t.id = l.track_id AND t.artist_id IS NULL AND t.lastfm_artist_name IS NOT NULL
    JOIN artists ar ON ar.name_normalized = lower(trim(t.lastfm_artist_name))
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
