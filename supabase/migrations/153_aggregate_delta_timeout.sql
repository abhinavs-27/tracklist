-- Increase resilience of apply_listening_aggregate_deltas against Supabase's
-- default statement timeout. The function is called from a cron job and is
-- expected to run for several seconds per chunk; SET LOCAL overrides the
-- connection-level timeout for this transaction only.
-- Also replaces verbose CASE expressions with NULLIF for readability.

CREATE OR REPLACE FUNCTION apply_listening_aggregate_deltas(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Override connection-level statement_timeout for this transaction.
  -- Cron chunks are expected to take 1-10s; 60s gives comfortable headroom.
  SET LOCAL statement_timeout = '60s';

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_listening_aggregates
    (user_id, entity_type, entity_id, count, week_start, month, year)
  SELECT
    (elem->>'user_id')::uuid,
    elem->>'entity_type',
    elem->>'entity_id',
    (elem->>'delta')::int,
    NULLIF(elem->>'week_start', '')::date,
    NULLIF(elem->>'month',      '')::date,
    NULLIF(elem->>'year',       '')::int
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE (elem->>'delta')::int IS NOT NULL
    AND (elem->>'delta')::int <> 0
  ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
  DO UPDATE SET
    count      = user_listening_aggregates.count + EXCLUDED.count,
    updated_at = now();
END;
$$;
