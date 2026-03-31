-- Run duplicate merges top-down each round: artists → albums → tracks.
-- Collapsing duplicate artists first aligns album_id / artist_id so album and track groups match
-- real-world catalog structure (same name under one artist, then one album, then one track).
--
-- Apply after 106.

CREATE OR REPLACE FUNCTION public.merge_catalog_duplicate_entities(p_max_rounds INT DEFAULT 50)
RETURNS TABLE (round_num INT, tracks_merged BIGINT, albums_merged BIGINT, artists_merged BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INT;
  tc BIGINT;
  ac BIGINT;
  arc BIGINT;
  rec RECORD;
BEGIN
  FOR i IN 1 .. GREATEST(1, LEAST(COALESCE(p_max_rounds, 50), 200)) LOOP
    tc := 0;
    ac := 0;
    arc := 0;

    FOR rec IN
      WITH g AS (
        SELECT array_agg(id ORDER BY created_at, id) AS ids
        FROM artists
        GROUP BY name_normalized
        HAVING COUNT(*) > 1
      )
      SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
      FROM g
    LOOP
      PERFORM public.merge_catalog_artist_pair(rec.winner_id, rec.loser_id);
      arc := arc + 1;
    END LOOP;

    FOR rec IN
      WITH g AS (
        SELECT array_agg(id ORDER BY created_at, id) AS ids
        FROM albums
        GROUP BY artist_id, name_normalized
        HAVING COUNT(*) > 1
      )
      SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
      FROM g
    LOOP
      PERFORM public.merge_catalog_album_pair(rec.winner_id, rec.loser_id);
      ac := ac + 1;
    END LOOP;

    FOR rec IN
      WITH g AS (
        SELECT
          array_agg(id ORDER BY created_at, id) AS ids
        FROM tracks
        GROUP BY
          artist_id,
          COALESCE(album_id, '00000000-0000-0000-0000-000000000000'::uuid),
          name_normalized
        HAVING COUNT(*) > 1
      )
      SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
      FROM g
    LOOP
      PERFORM public.merge_catalog_track_pair(rec.winner_id, rec.loser_id);
      tc := tc + 1;
    END LOOP;

    round_num := i;
    tracks_merged := tc;
    albums_merged := ac;
    artists_merged := arc;
    RETURN NEXT;

    EXIT WHEN tc = 0 AND ac = 0 AND arc = 0;
  END LOOP;

  PERFORM refresh_entity_stats();
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_catalog_duplicate_entities(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_catalog_duplicate_entities(INT) TO service_role;

COMMENT ON FUNCTION public.merge_catalog_duplicate_entities(INT) IS
  'Per round: merge duplicate artists (name_normalized), then albums (artist_id + name_normalized), then tracks (artist_id + album + name_normalized). Repeats up to p_max_rounds until no merges. Requires 103–106 merge_pair functions. Run: SELECT * FROM merge_catalog_duplicate_entities();';
