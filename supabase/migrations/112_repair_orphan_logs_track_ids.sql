-- One-off repair: logs.track_id may reference deleted tracks (e.g. failed merge before 111).
-- Resolves to a surviving canonical track when possible, then aligns album_id / artist_id.
--
-- Strategies (in order):
--   1) listens: same user_id + listened_at, spotify_track_id → track_external_ids (spotify).
--   2) listens: same user_id + listened_at — match artist_name + track_name to exactly one tracks row
--      (optional narrow: logs.album_id matches track.album_id when log.album_id is set).
--
-- If a row with (user_id, new_track_id, listened_at) already exists, the orphan log is deleted (duplicate listen).
--
-- Apply after 111.
-- Run in SQL editor:  SELECT * FROM repair_orphan_logs_track_ids();

CREATE OR REPLACE FUNCTION public.repair_orphan_logs_track_ids()
RETURNS TABLE (
  log_id uuid,
  old_track_id uuid,
  new_track_id uuid,
  outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_new uuid;
  v_album uuid;
  v_artist uuid;
  v_spotify text;
  ls_artist text;
  ls_track text;
  n_match int;
BEGIN
  FOR r IN
    SELECT l.id, l.user_id, l.track_id, l.listened_at, l.album_id, l.artist_id
    FROM logs l
    WHERE NOT EXISTS (SELECT 1 FROM tracks t WHERE t.id = l.track_id)
  LOOP
    v_new := NULL;
    outcome := 'unresolved';

    -- 1) listens → Spotify id → canonical track
    SELECT ls.spotify_track_id, ls.artist_name, ls.track_name
    INTO v_spotify, ls_artist, ls_track
    FROM listens ls
    WHERE ls.user_id = r.user_id
      AND ls.listened_at = r.listened_at
    ORDER BY ls.spotify_track_id NULLS LAST
    LIMIT 1;

    IF v_spotify IS NOT NULL THEN
      SELECT te.track_id INTO v_new
      FROM track_external_ids te
      WHERE te.source = 'spotify'
        AND te.external_id = v_spotify
        AND EXISTS (SELECT 1 FROM tracks t2 WHERE t2.id = te.track_id)
      LIMIT 1;
    END IF;

    -- 2) listens → artist + track name → exactly one catalog track
    IF v_new IS NULL AND ls_artist IS NOT NULL AND ls_track IS NOT NULL THEN
      SELECT count(*)::int INTO n_match
      FROM tracks t
      INNER JOIN artists a ON a.id = t.artist_id
      WHERE a.name_normalized = lower(trim(both from ls_artist))
        AND t.name_normalized = lower(trim(both from ls_track))
        AND (r.album_id IS NULL OR t.album_id IS NOT DISTINCT FROM r.album_id);

      IF n_match = 1 THEN
        SELECT t.id INTO v_new
        FROM tracks t
        INNER JOIN artists a ON a.id = t.artist_id
        WHERE a.name_normalized = lower(trim(both from ls_artist))
          AND t.name_normalized = lower(trim(both from ls_track))
          AND (r.album_id IS NULL OR t.album_id IS NOT DISTINCT FROM r.album_id)
        LIMIT 1;
      END IF;
    END IF;

    IF v_new IS NULL THEN
      log_id := r.id;
      old_track_id := r.track_id;
      new_track_id := NULL;
      outcome := 'unresolved';
      RETURN NEXT;
      CONTINUE;
    END IF;

    SELECT album_id, artist_id INTO v_album, v_artist
    FROM tracks
    WHERE id = v_new;

    IF EXISTS (
      SELECT 1
      FROM logs x
      WHERE x.user_id = r.user_id
        AND x.track_id = v_new
        AND x.listened_at = r.listened_at
        AND x.id <> r.id
    ) THEN
      DELETE FROM logs WHERE id = r.id;
      log_id := r.id;
      old_track_id := r.track_id;
      new_track_id := v_new;
      outcome := 'deleted_duplicate';
      RETURN NEXT;
      CONTINUE;
    END IF;

    UPDATE logs
    SET
      track_id = v_new,
      album_id = v_album,
      artist_id = v_artist
    WHERE id = r.id;

    log_id := r.id;
    old_track_id := r.track_id;
    new_track_id := v_new;
    outcome := 'repointed';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_orphan_logs_track_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_orphan_logs_track_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.repair_orphan_logs_track_ids() TO postgres;

COMMENT ON FUNCTION public.repair_orphan_logs_track_ids() IS
  'Repairs orphan logs.track_id via listens (Spotify id or unique artist+track name). Run: SELECT * FROM repair_orphan_logs_track_ids();';
