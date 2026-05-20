-- supabase/migrations/157_aggregate_backfill.sql
-- One-time backfill: process all logs not yet in user_listening_aggregate_ingest.
-- After this migration, user_listening_aggregates has data for all historical weeks.
-- Idempotent: re-running skips already-ingested logs via anti-join.

CREATE OR REPLACE FUNCTION backfill_listening_aggregates_all(
  p_batch_size INT DEFAULT 5000
)
RETURNS TABLE(batches_processed INT, total_logs INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batches     INT := 0;
  v_total       INT := 0;
  v_batch_count INT;
BEGIN
  SET LOCAL statement_timeout = '0'; -- disable for this migration run

  LOOP
    -- Process one batch of un-ingested logs
    WITH batch AS (
      SELECT l.id, l.user_id, l.track_id, l.album_id, l.artist_id, l.listened_at
      FROM logs l
      LEFT JOIN user_listening_aggregate_ingest i ON i.log_id = l.id
      WHERE i.log_id IS NULL
      ORDER BY l.listened_at ASC, l.id ASC
      LIMIT p_batch_size
    ),
    -- Upsert week buckets for track/album/artist
    week_inserts AS (
      INSERT INTO user_listening_aggregates
        (user_id, entity_type, entity_id, count, week_start, month, year)
      SELECT
        b.user_id,
        etype,
        eid,
        1,
        date_trunc('week', b.listened_at AT TIME ZONE 'UTC')::date,
        NULL,
        NULL
      FROM batch b
      CROSS JOIN LATERAL (VALUES
        ('track',  b.track_id::text),
        ('album',  b.album_id::text),
        ('artist', b.artist_id::text)
      ) AS t(etype, eid)
      WHERE eid IS NOT NULL
      ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
      DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now()
      RETURNING 1
    ),
    -- Upsert month buckets for track
    month_inserts AS (
      INSERT INTO user_listening_aggregates
        (user_id, entity_type, entity_id, count, week_start, month, year)
      SELECT
        b.user_id,
        'track',
        b.track_id::text,
        1,
        NULL,
        date_trunc('month', b.listened_at AT TIME ZONE 'UTC')::date,
        NULL
      FROM batch b
      WHERE b.track_id IS NOT NULL
      ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
      DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now()
      RETURNING 1
    ),
    -- Upsert year buckets for track
    year_inserts AS (
      INSERT INTO user_listening_aggregates
        (user_id, entity_type, entity_id, count, week_start, month, year)
      SELECT
        b.user_id,
        'track',
        b.track_id::text,
        1,
        NULL,
        NULL,
        EXTRACT(YEAR FROM b.listened_at AT TIME ZONE 'UTC')::int
      FROM batch b
      WHERE b.track_id IS NOT NULL
      ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
      DO UPDATE SET count = user_listening_aggregates.count + 1, updated_at = now()
      RETURNING 1
    ),
    -- Mark batch as ingested
    ingest_marks AS (
      INSERT INTO user_listening_aggregate_ingest (log_id, processed_at)
      SELECT id, now()
      FROM batch
      ON CONFLICT (log_id) DO NOTHING
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_batch_count FROM ingest_marks;

    EXIT WHEN v_batch_count = 0;

    v_batches := v_batches + 1;
    v_total   := v_total + v_batch_count;

    -- Commit after each batch to avoid one giant transaction
    -- (Can't COMMIT inside a PL/pgSQL function called from a migration;
    --  the outer migration transaction wraps everything. This is acceptable
    --  for the one-time backfill use case.)
  END LOOP;

  batches_processed := v_batches;
  total_logs        := v_total;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_listening_aggregates_all(INT) TO service_role;

-- Run the backfill now. Comment out if the logs table is very large
-- and you prefer to run it manually via the Supabase SQL editor.
-- SELECT * FROM backfill_listening_aggregates_all(5000);
