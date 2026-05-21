-- migration 166: repair orphaned artist aggregate rows from incomplete artist merges
--
-- Root cause: mergeCanonicalArtists does a blind UPDATE on user_listening_aggregates.
-- When the winner already has a row for the same (user, bucket), the UPDATE hits a
-- unique constraint violation and silently fails. Those loser rows stay with the old UUID.
-- The loser artist is then deleted from `artists`, leaving rows pointing to a ghost UUID
-- (shows as "Unknown" on the profile page with plays that should belong to the winner).
--
-- This repair finds those orphaned rows, infers the correct winner artist via album plays
-- in the same bucket, merges the counts, and deletes the orphaned rows.
-- Idempotent: only acts on rows where entity_id is not in artists table.

CREATE OR REPLACE FUNCTION repair_orphaned_artist_aggregates(
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(merged_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merged BIGINT := 0;
  rec RECORD;
BEGIN
  FOR rec IN (
    -- For each orphaned artist aggregate row, find the most-played album in the same
    -- bucket and use its artist_id as the winner.
    SELECT DISTINCT ON (ula.id)
      ula.id        AS orphan_id,
      ula.user_id,
      ula.count,
      ula.week_start,
      ula.month,
      ula.year,
      al.artist_id::text AS winner_id
    FROM user_listening_aggregates ula
    -- Find album aggregate rows in the same (user, bucket)
    JOIN user_listening_aggregates album_agg
      ON album_agg.user_id    = ula.user_id
     AND album_agg.entity_type = 'album'
     AND album_agg.week_start  IS NOT DISTINCT FROM ula.week_start
     AND album_agg.month       IS NOT DISTINCT FROM ula.month
     AND album_agg.year        IS NOT DISTINCT FROM ula.year
    -- Join to albums to get the current artist_id (winner after merge)
    JOIN albums al
      ON al.id::text = album_agg.entity_id
     AND al.artist_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM artists a WHERE a.id = al.artist_id)
    WHERE ula.entity_type = 'artist'
      AND (p_user_id IS NULL OR ula.user_id = p_user_id)
      -- Orphaned = entity_id no longer exists in artists
      AND NOT EXISTS (SELECT 1 FROM artists a WHERE a.id::text = ula.entity_id)
    -- Pick the album with the most plays to break ties
    ORDER BY ula.id, album_agg.count DESC
  )
  LOOP
    -- Merge orphaned count into winner's row (upsert: add if row exists, insert if not)
    INSERT INTO user_listening_aggregates
      (user_id, entity_type, entity_id, count, week_start, month, year)
    VALUES
      (rec.user_id, 'artist', rec.winner_id, rec.count, rec.week_start, rec.month, rec.year)
    ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
    DO UPDATE SET
      count      = user_listening_aggregates.count + EXCLUDED.count,
      updated_at = now();

    -- Remove the orphaned row
    DELETE FROM user_listening_aggregates WHERE id = rec.orphan_id;

    v_merged := v_merged + 1;
  END LOOP;

  RETURN QUERY SELECT v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION repair_orphaned_artist_aggregates(UUID) TO service_role;
