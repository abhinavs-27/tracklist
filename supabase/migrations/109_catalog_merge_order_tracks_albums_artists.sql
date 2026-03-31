-- 109: Run tracks (songs) → albums → artists each round.
--
-- Rationale: merge duplicate listening/review rows first when the same recording exists as
-- multiple UUIDs; then collapse album rows; finally merge artists that share name_normalized.
-- Multiple rounds still run until a quiet round — order mainly affects *which* merges surface first.
--
-- Also adds merge_catalog_diag() for SQL editor: duplicate group counts + function presence.
--
-- Apply after 108.

CREATE OR REPLACE FUNCTION public.merge_catalog_diag()
RETURNS TABLE (
  dup_artist_groups bigint,
  dup_album_groups bigint,
  dup_track_groups bigint,
  merge_catalog_duplicate_entities_exists boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM (
      SELECT 1 FROM artists GROUP BY name_normalized HAVING COUNT(*) > 1
    ) _a),
    (SELECT COUNT(*)::bigint FROM (
      SELECT 1 FROM albums GROUP BY artist_id, name_normalized HAVING COUNT(*) > 1
    ) _b),
    (SELECT COUNT(*)::bigint FROM (
      SELECT 1 FROM tracks
      GROUP BY
        artist_id,
        COALESCE(album_id, '00000000-0000-0000-0000-000000000000'::uuid),
        name_normalized
      HAVING COUNT(*) > 1
    ) _c),
    EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'merge_catalog_duplicate_entities'
    );
$$;

REVOKE ALL ON FUNCTION public.merge_catalog_diag() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_catalog_diag() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_diag() TO postgres;

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
      BEGIN
        PERFORM public.merge_catalog_track_pair(rec.winner_id, rec.loser_id);
        tc := tc + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'merge_catalog_track_pair loser % → winner %: %',
          rec.loser_id, rec.winner_id, SQLERRM;
      END;
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
      BEGIN
        PERFORM public.merge_catalog_album_pair(rec.winner_id, rec.loser_id);
        ac := ac + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'merge_catalog_album_pair loser % → winner %: %',
          rec.loser_id, rec.winner_id, SQLERRM;
      END;
    END LOOP;

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
      BEGIN
        PERFORM public.merge_catalog_artist_pair(rec.winner_id, rec.loser_id);
        arc := arc + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'merge_catalog_artist_pair loser % → winner %: %',
          rec.loser_id, rec.winner_id, SQLERRM;
      END;
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
GRANT EXECUTE ON FUNCTION public.merge_catalog_duplicate_entities(INT) TO postgres;

COMMENT ON FUNCTION public.merge_catalog_duplicate_entities(INT) IS
  'Per round: tracks → albums → artists. Failures per pair log WARNING and skip. Run: SELECT * FROM merge_catalog_duplicate_entities();';

COMMENT ON FUNCTION public.merge_catalog_diag() IS
  'Before/after merge: duplicate group counts + whether merge_catalog_duplicate_entities exists. Run: SELECT * FROM merge_catalog_diag();';
