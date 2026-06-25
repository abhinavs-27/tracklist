-- Rewrite refresh_genre_covers_for_buckets as a single set-based UPDATE.
-- The previous row-by-row PL/pgSQL loop ran one SELECT+UPDATE per bucket,
-- timing out on large batches (e.g. after a full Last.fm import).
-- This version resolves all buckets in one query regardless of batch size.

CREATE OR REPLACE FUNCTION refresh_genre_covers_for_buckets(p_buckets jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_buckets IS NULL OR jsonb_typeof(p_buckets) <> 'array' OR jsonb_array_length(p_buckets) = 0 THEN
    RETURN;
  END IF;

  UPDATE user_listening_aggregates u
  SET
    cover_image_url = sub.image_url,
    updated_at      = now()
  FROM (
    SELECT DISTINCT ON (
      (b->>'user_id')::uuid,
      b->>'genre',
      NULLIF(b->>'week_start', '')::date,
      NULLIF(b->>'month',      '')::date,
      NULLIF(b->>'year',       '')::int
    )
      (b->>'user_id')::uuid           AS user_id,
      b->>'genre'                      AS genre,
      NULLIF(b->>'week_start', '')::date AS week_start,
      NULLIF(b->>'month',      '')::date AS month,
      NULLIF(b->>'year',       '')::int  AS year,
      a.image_url
    FROM jsonb_array_elements(p_buckets) AS b
    JOIN user_listening_genre_contributors c
      ON  c.user_id     = (b->>'user_id')::uuid
      AND c.genre       = b->>'genre'
      AND c.week_start  IS NOT DISTINCT FROM NULLIF(b->>'week_start', '')::date
      AND c.month       IS NOT DISTINCT FROM NULLIF(b->>'month',      '')::date
      AND c.year        IS NOT DISTINCT FROM NULLIF(b->>'year',       '')::int
    JOIN artists a ON a.id = c.artist_id
    WHERE (b->>'genre') IS NOT NULL
      AND trim(b->>'genre') <> ''
    ORDER BY
      (b->>'user_id')::uuid,
      b->>'genre',
      NULLIF(b->>'week_start', '')::date,
      NULLIF(b->>'month',      '')::date,
      NULLIF(b->>'year',       '')::int,
      c.play_count DESC,
      (a.image_url IS NOT NULL AND length(trim(a.image_url)) > 0) DESC,
      c.artist_id
  ) sub
  WHERE u.user_id     = sub.user_id
    AND u.entity_type = 'genre'
    AND u.entity_id   = sub.genre
    AND u.week_start  IS NOT DISTINCT FROM sub.week_start
    AND u.month       IS NOT DISTINCT FROM sub.month
    AND u.year        IS NOT DISTINCT FROM sub.year;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_genre_covers_for_buckets(jsonb) TO service_role;
