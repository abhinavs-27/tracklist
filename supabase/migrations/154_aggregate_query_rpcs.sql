-- Server-side aggregation helpers for user_listening_aggregates.
-- All-time totals require summing per-year rows per entity. Doing this in
-- application code hits PostgREST's default 1000-row cap, silently truncating
-- results for heavy users.

-- Returns (entity_id, total_count) for a user + entity type across all years,
-- ordered by total descending.
CREATE OR REPLACE FUNCTION get_user_entity_totals(
  p_user_id     UUID,
  p_entity_type TEXT,
  p_limit       INT DEFAULT 50
)
RETURNS TABLE(entity_id TEXT, total_count BIGINT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT entity_id, SUM(count)::BIGINT AS total_count
  FROM user_listening_aggregates
  WHERE user_id = p_user_id
    AND entity_type = p_entity_type
    AND year IS NOT NULL
  GROUP BY entity_id
  ORDER BY total_count DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$$;

-- Returns the true all-time play count for a user (sum of yearly track buckets).
-- Using track entity_type: each log increments exactly one track bucket.
CREATE OR REPLACE FUNCTION get_user_total_play_count(p_user_id UUID)
RETURNS BIGINT
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(count), 0)::BIGINT
  FROM user_listening_aggregates
  WHERE user_id = p_user_id
    AND entity_type = 'track'
    AND year IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION get_user_entity_totals(UUID, TEXT, INT)    TO service_role;
GRANT EXECUTE ON FUNCTION get_user_total_play_count(UUID)             TO service_role;
