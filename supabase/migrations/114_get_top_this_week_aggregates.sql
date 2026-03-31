-- Server-side aggregates for profile "top this week" (rolling window).
-- Replaces fetching up to 20k log rows into the app and counting in memory.

CREATE OR REPLACE FUNCTION public.get_top_this_week_aggregates(
  p_user_id UUID,
  p_start TIMESTAMPTZ,
  p_end_exclusive TIMESTAMPTZ,
  p_top_n INT DEFAULT 10,
  p_log_cap INT DEFAULT 20000
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      l.track_id,
      l.artist_id AS log_artist_id
    FROM logs l
    WHERE l.user_id = p_user_id
      AND l.listened_at >= p_start
      AND l.listened_at < p_end_exclusive
    LIMIT p_log_cap
  ),
  base AS (
    SELECT
      s.track_id,
      s.log_artist_id,
      t.artist_id AS track_artist_id,
      t.album_id AS track_album_id
    FROM scoped s
    LEFT JOIN tracks t ON t.id = s.track_id
  ),
  track_agg AS (
    SELECT track_id, COUNT(*)::BIGINT AS c
    FROM base
    WHERE track_id IS NOT NULL
    GROUP BY track_id
    ORDER BY c DESC
    LIMIT p_top_n
  ),
  artist_rows AS (
    SELECT COALESCE(b.log_artist_id, b.track_artist_id) AS artist_id
    FROM base b
    WHERE b.track_id IS NOT NULL
  ),
  artist_agg AS (
    SELECT artist_id, COUNT(*)::BIGINT AS c
    FROM artist_rows
    WHERE artist_id IS NOT NULL
    GROUP BY artist_id
    ORDER BY c DESC
    LIMIT p_top_n
  ),
  album_rows AS (
    SELECT b.track_album_id AS album_id
    FROM base b
    WHERE b.track_id IS NOT NULL
      AND b.track_album_id IS NOT NULL
  ),
  album_agg AS (
    SELECT album_id, COUNT(*)::BIGINT AS c
    FROM album_rows
    WHERE album_id IS NOT NULL
    GROUP BY album_id
    ORDER BY c DESC
    LIMIT p_top_n
  )
  SELECT jsonb_build_object(
    'tracks',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('track_id', track_id::text, 'play_count', c)
          ORDER BY c DESC
        )
        FROM track_agg
      ),
      '[]'::jsonb
    ),
    'artists',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('artist_id', artist_id::text, 'play_count', c)
          ORDER BY c DESC
        )
        FROM artist_agg
      ),
      '[]'::jsonb
    ),
    'albums',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('album_id', album_id::text, 'play_count', c)
          ORDER BY c DESC
        )
        FROM album_agg
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION public.get_top_this_week_aggregates IS
  'Top tracks/artists/albums for a user in [p_start, p_end_exclusive), capped at p_log_cap log rows (same cap as app).';

-- Server-only (service role). Do not grant to `authenticated`: `p_user_id` is not tied to JWT.
GRANT EXECUTE ON FUNCTION public.get_top_this_week_aggregates(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO service_role;
