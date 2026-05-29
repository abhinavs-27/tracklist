-- 172_fix_aggregate_watermark_created_at.sql
--
-- Problem: the watermark tracks by listened_at, so backdated logs (Last.fm imports,
-- manual entries with historical dates) are silently skipped forever — their
-- listened_at is before the watermark so get_pending_logs_for_aggregates never
-- returns them.
--
-- Fix: switch to tracking by created_at (row insertion time). created_at always
-- advances forward regardless of what listened_at is set to, so every new insert
-- is captured on the next cron run.

-- Index to support the new created_at range scan efficiently.
CREATE INDEX IF NOT EXISTS idx_logs_created_at_id ON logs(created_at ASC, id ASC);

-- Add the new watermark column.
ALTER TABLE aggregate_ingest_watermark
  ADD COLUMN IF NOT EXISTS last_processed_created_at TIMESTAMPTZ;

-- Seed: if there are any unprocessed logs, set the watermark to just before
-- the earliest one so the next cron run picks them all up.
-- If everything is already processed, use the max created_at of processed logs.
UPDATE aggregate_ingest_watermark
SET last_processed_created_at = COALESCE(
  (
    SELECT l.created_at - INTERVAL '1 microsecond'
    FROM logs l
    WHERE NOT EXISTS (
      SELECT 1 FROM user_listening_aggregate_ingest i WHERE i.log_id = l.id
    )
    ORDER BY l.created_at ASC, l.id ASC
    LIMIT 1
  ),
  (
    SELECT l.created_at
    FROM logs l
    JOIN user_listening_aggregate_ingest i ON i.log_id = l.id
    ORDER BY l.created_at DESC
    LIMIT 1
  ),
  '1970-01-01'::timestamptz
);

ALTER TABLE aggregate_ingest_watermark
  ALTER COLUMN last_processed_created_at SET NOT NULL;

-- Replace the pending logs function to use the created_at range scan.
CREATE OR REPLACE FUNCTION get_pending_logs_for_aggregates(p_limit INT DEFAULT 2000)
RETURNS SETOF logs
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.*
  FROM logs l
  CROSS JOIN aggregate_ingest_watermark w
  WHERE l.created_at > w.last_processed_created_at
     OR (l.created_at = w.last_processed_created_at AND l.id > w.last_processed_log_id)
  ORDER BY l.created_at ASC, l.id ASC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$$;

-- Update the advance function to also track created_at.
-- p_listened_at is kept so application code can be updated independently.
CREATE OR REPLACE FUNCTION advance_aggregate_ingest_watermark(
  p_listened_at TIMESTAMPTZ,
  p_log_id      UUID,
  p_created_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE aggregate_ingest_watermark
  SET last_processed_listened_at = p_listened_at,
      last_processed_log_id      = p_log_id,
      last_processed_created_at  = COALESCE(p_created_at, now())
  WHERE id = true;
$$;

GRANT SELECT, UPDATE ON aggregate_ingest_watermark TO service_role;
GRANT EXECUTE ON FUNCTION get_pending_logs_for_aggregates(INT) TO service_role;
GRANT EXECUTE ON FUNCTION advance_aggregate_ingest_watermark(TIMESTAMPTZ, UUID, TIMESTAMPTZ) TO service_role;
