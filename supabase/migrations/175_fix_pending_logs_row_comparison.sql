-- 175_fix_pending_logs_row_comparison.sql
--
-- get_pending_logs_for_aggregates was LANGUAGE sql, which cannot SET LOCAL
-- statement_timeout. The connection-level timeout (~4s on Supabase) kills it
-- before the query finishes on large log tables. apply_listening_aggregate_deltas
-- (migration 153) already uses this pattern — match it here.
--
-- Two changes:
--   1. Convert to LANGUAGE plpgsql + SET LOCAL statement_timeout = '60s'
--   2. Read watermark into scalar variables before the query so Postgres plans
--      against constants rather than a CROSS JOIN, letting it use
--      idx_logs_created_at_id as a tight range scan.

CREATE OR REPLACE FUNCTION get_pending_logs_for_aggregates(p_limit INT DEFAULT 2000)
RETURNS SETOF logs
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_created_at TIMESTAMPTZ;
  v_log_id     UUID;
BEGIN
  SET LOCAL statement_timeout = '60s';

  SELECT last_processed_created_at, last_processed_log_id
    INTO v_created_at, v_log_id
    FROM aggregate_ingest_watermark
   LIMIT 1;

  RETURN QUERY
    SELECT l.*
      FROM logs l
     WHERE (l.created_at, l.id) > (v_created_at, v_log_id)
     ORDER BY l.created_at ASC, l.id ASC
     LIMIT GREATEST(1, LEAST(p_limit, 10000));
END;
$$;

-- Ensure the supporting index exists (created in 172 but guard here too).
CREATE INDEX IF NOT EXISTS idx_logs_created_at_id ON logs(created_at ASC, id ASC);

GRANT EXECUTE ON FUNCTION get_pending_logs_for_aggregates(INT) TO service_role;
