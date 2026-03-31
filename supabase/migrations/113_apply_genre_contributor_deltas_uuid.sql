-- 101 made user_listening_genre_contributors.artist_id UUID; apply_genre_contributor_deltas
-- still inserted elem->>'artist_id' (text) → "column artist_id is of type uuid but expression is of type text".

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
    (elem->>'artist_id')::uuid,
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
