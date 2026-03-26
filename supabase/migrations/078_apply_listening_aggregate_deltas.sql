-- Bulk apply for listening aggregates cron: one round-trip per chunk instead of one per key.

CREATE OR REPLACE FUNCTION apply_listening_aggregate_deltas(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO user_listening_aggregates (user_id, entity_type, entity_id, count, week_start, month, year)
  SELECT
    (elem->>'user_id')::uuid,
    elem->>'entity_type',
    elem->>'entity_id',
    (elem->>'delta')::int,
    CASE
      WHEN elem->>'week_start' IS NULL OR elem->>'week_start' = '' THEN NULL
      ELSE (elem->>'week_start')::date
    END,
    CASE
      WHEN elem->>'month' IS NULL OR elem->>'month' = '' THEN NULL
      ELSE (elem->>'month')::date
    END,
    CASE
      WHEN elem->>'year' IS NULL OR elem->>'year' = '' THEN NULL
      ELSE (elem->>'year')::int
    END
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE (elem->>'delta')::int IS NOT NULL
    AND (elem->>'delta')::int <> 0
  ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
  DO UPDATE SET
    count = user_listening_aggregates.count + EXCLUDED.count,
    updated_at = now();
END;
$$;

-- App calls this once per chunk (5000 rows) via `p_rows`; multiple chunks = multiple RPCs.
