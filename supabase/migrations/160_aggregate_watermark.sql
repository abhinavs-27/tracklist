-- supabase/migrations/160_aggregate_watermark.sql
-- Replace the anti-join tracking table with a single-row watermark cursor.
-- Pre-condition: migration 157 backfill has run; all logs are in user_listening_aggregate_ingest.

CREATE TABLE IF NOT EXISTS aggregate_ingest_watermark (
  id                         BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  last_processed_listened_at TIMESTAMPTZ NOT NULL,
  last_processed_log_id      UUID        NOT NULL
);

ALTER TABLE aggregate_ingest_watermark DISABLE ROW LEVEL SECURITY;

-- Seed the watermark from the current max of the ingest table.
-- If the ingest table is empty (no logs yet), use epoch as sentinel.
INSERT INTO aggregate_ingest_watermark
  (id, last_processed_listened_at, last_processed_log_id)
SELECT
  true,
  COALESCE(MAX(l.listened_at), '1970-01-01'::timestamptz),
  COALESCE(
    (SELECT i2.log_id FROM user_listening_aggregate_ingest i2
     JOIN logs l2 ON l2.id = i2.log_id
     WHERE l2.listened_at = (SELECT MAX(l3.listened_at) FROM user_listening_aggregate_ingest i3 JOIN logs l3 ON l3.id = i3.log_id)
     ORDER BY i2.log_id ASC LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::uuid
  )
FROM user_listening_aggregate_ingest i
JOIN logs l ON l.id = i.log_id
ON CONFLICT (id) DO NOTHING;

-- Replace the anti-join function with a watermark range scan.
CREATE OR REPLACE FUNCTION get_pending_logs_for_aggregates(p_limit INT DEFAULT 2000)
RETURNS SETOF logs
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.*
  FROM logs l
  CROSS JOIN aggregate_ingest_watermark w
  WHERE l.listened_at > w.last_processed_listened_at
     OR (l.listened_at = w.last_processed_listened_at AND l.id > w.last_processed_log_id)
  ORDER BY l.listened_at ASC, l.id ASC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$$;

-- Called after each batch to advance the cursor.
CREATE OR REPLACE FUNCTION advance_aggregate_ingest_watermark(
  p_listened_at TIMESTAMPTZ,
  p_log_id      UUID
)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE aggregate_ingest_watermark
  SET last_processed_listened_at = p_listened_at,
      last_processed_log_id      = p_log_id
  WHERE id = true;
$$;

GRANT SELECT, UPDATE ON aggregate_ingest_watermark TO service_role;
GRANT EXECUTE ON FUNCTION get_pending_logs_for_aggregates(INT) TO service_role;
GRANT EXECUTE ON FUNCTION advance_aggregate_ingest_watermark(TIMESTAMPTZ, UUID) TO service_role;
