-- Earliest listen timestamp per artist for a user, scoped to candidate artist IDs.
-- Used by profile Pulse "New discoveries" (first-time listens now in your chart).

CREATE OR REPLACE FUNCTION public.first_listen_at_for_artists(
  p_user_id UUID,
  p_artist_ids TEXT[]
)
RETURNS TABLE (
  artist_id TEXT,
  first_listened_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      l.listened_at,
      COALESCE(l.artist_id, t.artist_id) AS resolved_artist_id
    FROM logs l
    LEFT JOIN tracks t ON t.id = l.track_id
    WHERE l.user_id = p_user_id
      AND (
        l.artist_id = ANY(p_artist_ids)
        OR (t.artist_id IS NOT NULL AND t.artist_id = ANY(p_artist_ids))
      )
  )
  SELECT
    s.resolved_artist_id::TEXT AS artist_id,
    MIN(s.listened_at) AS first_listened_at
  FROM scoped s
  WHERE s.resolved_artist_id IS NOT NULL
    AND s.resolved_artist_id = ANY(p_artist_ids)
  GROUP BY s.resolved_artist_id;
$$;

COMMENT ON FUNCTION public.first_listen_at_for_artists(UUID, TEXT[]) IS
  'MIN(listened_at) per resolved artist for a user, only for rows that may match p_artist_ids (same COALESCE as top-this-week aggregates).';

GRANT EXECUTE ON FUNCTION public.first_listen_at_for_artists(UUID, TEXT[]) TO service_role;
