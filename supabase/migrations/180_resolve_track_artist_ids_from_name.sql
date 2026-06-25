-- Back-fill tracks.artist_id for Last.fm-imported tracks where enrichment has not
-- yet run. Joins tracks.lastfm_artist_name → artists.name_normalized (indexed).
--
-- Safe to run repeatedly — only updates rows where artist_id IS NULL.
-- Optional p_user_id scopes the update to tracks referenced by that user's logs.

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
  SET LOCAL statement_timeout = '10 minutes';

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
