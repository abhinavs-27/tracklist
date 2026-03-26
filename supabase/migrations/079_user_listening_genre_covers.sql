-- Genre rows: track which artists contributed plays (for cover art) + denormalized image on aggregates.

ALTER TABLE user_listening_aggregates
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN user_listening_aggregates.cover_image_url IS
  'For entity_type=genre: image of the top contributing artist (by play_count in user_listening_genre_contributors).';

CREATE TABLE IF NOT EXISTS user_listening_genre_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  week_start DATE,
  month DATE,
  year INT,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  play_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ugc_bucket_one CHECK (
    (week_start IS NOT NULL AND month IS NULL AND year IS NULL)
    OR (week_start IS NULL AND month IS NOT NULL AND year IS NULL)
    OR (week_start IS NULL AND month IS NULL AND year IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_genre_contrib_bucket_artist
  ON user_listening_genre_contributors (user_id, genre, week_start, month, year, artist_id)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_ugc_lookup
  ON user_listening_genre_contributors (user_id, genre, week_start, month, year);

ALTER TABLE user_listening_genre_contributors DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_listening_genre_contributors IS
  'Per bucket: per-artist play counts attributed to a genre (from artist.genres tags). Used to pick cover_image_url on user_listening_aggregates for genre rows.';

-- Bulk upsert contributor deltas (cron).
CREATE OR REPLACE FUNCTION apply_genre_contributor_deltas(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_listening_genre_contributors (
    user_id, genre, week_start, month, year, artist_id, play_count
  )
  SELECT
    (elem->>'user_id')::uuid,
    elem->>'genre',
    CASE
      WHEN elem->>'week_start' IS NULL OR elem->>'week_start' = '' THEN NULL
      ELSE (elem->>'week_start')::date
    END,
    CASE
      WHEN elem->>'month' IS NULL OR elem->>'month' = '' THEN NULL
      ELSE (elem->>'month')::date
    END,
    CASE
      WHEN elem->>'year' IS NULL OR elem->>'year' = '' THEN NULL
      ELSE (elem->>'year')::int
    END,
    elem->>'artist_id',
    (elem->>'delta')::int
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE (elem->>'delta')::int IS NOT NULL
    AND (elem->>'delta')::int <> 0
    AND elem->>'genre' IS NOT NULL
    AND elem->>'artist_id' IS NOT NULL
  ON CONFLICT (user_id, genre, week_start, month, year, artist_id)
  DO UPDATE SET
    play_count = user_listening_genre_contributors.play_count + EXCLUDED.play_count,
    updated_at = now();
END;
$$;

-- Refresh genre aggregate covers from top contributor (by play_count; prefer artist with image on ties).
CREATE OR REPLACE FUNCTION refresh_genre_covers_for_buckets(p_buckets jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  elem jsonb;
  v_user_id UUID;
  v_genre TEXT;
  v_ws DATE;
  v_mn DATE;
  v_yr INT;
  v_url TEXT;
BEGIN
  IF p_buckets IS NULL OR jsonb_typeof(p_buckets) <> 'array' OR jsonb_array_length(p_buckets) = 0 THEN
    RETURN;
  END IF;

  FOR elem IN SELECT * FROM jsonb_array_elements(p_buckets)
  LOOP
    v_user_id := (elem->>'user_id')::uuid;
    v_genre := elem->>'genre';
    IF v_genre IS NULL OR v_genre = '' THEN
      CONTINUE;
    END IF;

    v_ws := CASE
      WHEN elem->>'week_start' IS NULL OR elem->>'week_start' = '' THEN NULL
      ELSE (elem->>'week_start')::date
    END;
    v_mn := CASE
      WHEN elem->>'month' IS NULL OR elem->>'month' = '' THEN NULL
      ELSE (elem->>'month')::date
    END;
    v_yr := CASE
      WHEN elem->>'year' IS NULL OR elem->>'year' = '' THEN NULL
      ELSE (elem->>'year')::int
    END;

    v_url := NULL;
    SELECT a.image_url INTO v_url
    FROM user_listening_genre_contributors c
    INNER JOIN artists a ON a.id = c.artist_id
    WHERE c.user_id = v_user_id
      AND c.genre = v_genre
      AND c.week_start IS NOT DISTINCT FROM v_ws
      AND c.month IS NOT DISTINCT FROM v_mn
      AND c.year IS NOT DISTINCT FROM v_yr
    ORDER BY
      c.play_count DESC,
      (a.image_url IS NOT NULL AND length(trim(a.image_url)) > 0) DESC,
      c.artist_id
    LIMIT 1;

    UPDATE user_listening_aggregates u
    SET
      cover_image_url = v_url,
      updated_at = now()
    WHERE u.user_id = v_user_id
      AND u.entity_type = 'genre'
      AND u.entity_id = v_genre
      AND u.week_start IS NOT DISTINCT FROM v_ws
      AND u.month IS NOT DISTINCT FROM v_mn
      AND u.year IS NOT DISTINCT FROM v_yr;
  END LOOP;
END;
$$;
