-- List duplicate (winner, loser) pairs for one-off or script-driven merges.
-- Each pair is intended for merge_catalog_*_pair RPCs (separate transaction per call from PostgREST).
--
-- Apply after 104 (merge_pair functions must exist).

CREATE OR REPLACE FUNCTION public.merge_catalog_list_track_duplicate_pairs()
RETURNS TABLE (winner_id uuid, loser_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  FROM g;
$$;

CREATE OR REPLACE FUNCTION public.merge_catalog_list_album_duplicate_pairs()
RETURNS TABLE (winner_id uuid, loser_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH g AS (
    SELECT array_agg(id ORDER BY created_at, id) AS ids
    FROM albums
    GROUP BY artist_id, name_normalized
    HAVING COUNT(*) > 1
  )
  SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
  FROM g;
$$;

CREATE OR REPLACE FUNCTION public.merge_catalog_list_artist_duplicate_pairs()
RETURNS TABLE (winner_id uuid, loser_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH g AS (
    SELECT array_agg(id ORDER BY created_at, id) AS ids
    FROM artists
    GROUP BY name_normalized
    HAVING COUNT(*) > 1
  )
  SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
  FROM g;
$$;

REVOKE ALL ON FUNCTION public.merge_catalog_list_track_duplicate_pairs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_catalog_list_album_duplicate_pairs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_catalog_list_artist_duplicate_pairs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.merge_catalog_list_track_duplicate_pairs() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_list_album_duplicate_pairs() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_list_artist_duplicate_pairs() TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_list_track_duplicate_pairs() TO postgres;
GRANT EXECUTE ON FUNCTION public.merge_catalog_list_album_duplicate_pairs() TO postgres;
GRANT EXECUTE ON FUNCTION public.merge_catalog_list_artist_duplicate_pairs() TO postgres;

COMMENT ON FUNCTION public.merge_catalog_list_track_duplicate_pairs() IS
  'Returns (oldest id, each duplicate id) for tracks. Use with merge_catalog_track_pair via service RPC.';
