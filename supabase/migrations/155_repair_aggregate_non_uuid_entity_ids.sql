-- Repair: user_listening_aggregates rows where entity_id is a Spotify base-62
-- ID instead of a canonical UUID. This happens when the aggregates cron ran
-- on logs whose artist_id / album_id / track_id columns still held raw Spotify
-- IDs that were never resolved to the canonical UUID catalog.
--
-- Strategy (per entity_type):
--   artist:  look up in artist_external_ids → canonical UUID.
--            Fallback: trace logs.artist_id → tracks.artist_id (UUID).
--   album:   same via album_external_ids, fallback via logs.album_id → tracks.album_id.
--   track:   look up in track_external_ids.
--   genre:   entity_id is plain text (e.g. "indie rock") — never a UUID, never broken.
--
-- Run in the SQL editor:
--   SELECT * FROM repair_aggregate_non_uuid_entity_ids(false);  -- dry run
--   SELECT * FROM repair_aggregate_non_uuid_entity_ids(true);   -- apply

DROP FUNCTION IF EXISTS public.repair_aggregate_non_uuid_entity_ids(BOOLEAN);

CREATE OR REPLACE FUNCTION public.repair_aggregate_non_uuid_entity_ids(
  p_apply BOOLEAN DEFAULT false
)
-- Output columns prefixed with "out_" to avoid ambiguity with same-named
-- table columns inside SQL statements in this function body.
RETURNS TABLE (
  out_entity_type  TEXT,
  out_old_id       TEXT,
  out_new_id       TEXT,
  out_outcome      TEXT,
  out_affected     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_canon  UUID;
  v_count  BIGINT;
  v_etype  TEXT;
  v_eid    TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT ula.entity_type AS etype, ula.entity_id AS eid
    FROM user_listening_aggregates ula
    WHERE ula.entity_type IN ('artist', 'album', 'track')
      AND ula.entity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY ula.entity_type, ula.entity_id
  LOOP
    v_canon := NULL;
    v_count := 0;
    v_etype := r.etype;
    v_eid   := r.eid;

    -- ── Resolve Spotify ID → canonical UUID ──────────────────────────────────
    -- Pass 1: external ID tables (source-agnostic).
    -- Pass 2: trace through logs → tracks for artist/album (handles cases
    --   where the catalog entry exists but the external_id row is missing).

    IF v_etype = 'artist' THEN
      SELECT aei.artist_id INTO v_canon
      FROM artist_external_ids aei
      WHERE aei.external_id = v_eid
      LIMIT 1;

      IF v_canon IS NULL THEN
        SELECT t.artist_id INTO v_canon
        FROM logs l
        JOIN tracks t ON t.id = l.track_id
        WHERE l.artist_id::text = v_eid
          AND t.artist_id IS NOT NULL
        LIMIT 1;
      END IF;

    ELSIF v_etype = 'album' THEN
      SELECT aei.album_id INTO v_canon
      FROM album_external_ids aei
      WHERE aei.external_id = v_eid
      LIMIT 1;

      IF v_canon IS NULL THEN
        SELECT t.album_id INTO v_canon
        FROM logs l
        JOIN tracks t ON t.id = l.track_id
        WHERE l.album_id::text = v_eid
          AND t.album_id IS NOT NULL
        LIMIT 1;
      END IF;

    ELSIF v_etype = 'track' THEN
      SELECT tei.track_id INTO v_canon
      FROM track_external_ids tei
      WHERE tei.external_id = v_eid
      LIMIT 1;
    END IF;

    -- ── Apply or report ───────────────────────────────────────────────────────
    IF v_canon IS NOT NULL THEN
      IF p_apply THEN
        -- Merge into canonical UUID row (or insert if not yet present).
        INSERT INTO user_listening_aggregates
          (user_id, entity_type, entity_id, count, week_start, month, year)
        SELECT
          src.user_id,
          src.entity_type,
          v_canon::text,
          src.count,
          src.week_start,
          src.month,
          src.year
        FROM user_listening_aggregates src
        WHERE src.entity_type = v_etype
          AND src.entity_id   = v_eid
        ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
        DO UPDATE SET
          count      = user_listening_aggregates.count + EXCLUDED.count,
          updated_at = now();

        GET DIAGNOSTICS v_count = ROW_COUNT;

        DELETE FROM user_listening_aggregates tgt
        WHERE tgt.entity_type = v_etype
          AND tgt.entity_id   = v_eid;
      ELSE
        SELECT COUNT(*) INTO v_count
        FROM user_listening_aggregates chk
        WHERE chk.entity_type = v_etype
          AND chk.entity_id   = v_eid;
      END IF;

      out_entity_type := v_etype;
      out_old_id      := v_eid;
      out_new_id      := v_canon::text;
      out_outcome     := CASE WHEN p_apply THEN 'remapped' ELSE 'would_remap' END;
      out_affected    := v_count;
      RETURN NEXT;

    ELSE
      -- Genuinely unresolvable: no catalog entry found via any path.
      IF p_apply THEN
        DELETE FROM user_listening_aggregates tgt2
        WHERE tgt2.entity_type = v_etype
          AND tgt2.entity_id   = v_eid;

        GET DIAGNOSTICS v_count = ROW_COUNT;
      ELSE
        SELECT COUNT(*) INTO v_count
        FROM user_listening_aggregates chk2
        WHERE chk2.entity_type = v_etype
          AND chk2.entity_id   = v_eid;
      END IF;

      out_entity_type := v_etype;
      out_old_id      := v_eid;
      out_new_id      := NULL;
      out_outcome     := CASE WHEN p_apply THEN 'deleted' ELSE 'would_delete' END;
      out_affected    := v_count;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_aggregate_non_uuid_entity_ids(BOOLEAN) TO service_role;
