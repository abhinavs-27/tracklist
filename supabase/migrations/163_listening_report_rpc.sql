-- supabase/migrations/163_listening_report_rpc.sql
-- Fast path for listening reports: sum user_listening_aggregates instead of
-- paginating raw logs. Returns (entity_type, entity_id, total_count) for
-- all weeks whose Monday falls within [Monday(p_start_date), Monday(p_end_date)].
--
-- Date semantics: includes all weeks overlapping the requested range.
-- Edge over-count: 0–6 extra days at each boundary — acceptable for a report.
-- Genre counts are NOT returned; TypeScript derives them from artist play counts.

CREATE OR REPLACE FUNCTION get_listening_report_from_aggregates(
  p_user_id    UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE(entity_type TEXT, entity_id TEXT, total_count BIGINT)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT
    entity_type,
    entity_id,
    SUM(count)::BIGINT AS total_count
  FROM user_listening_aggregates
  WHERE user_id    = p_user_id
    AND week_start IS NOT NULL
    AND entity_type IN ('track', 'album', 'artist')
    AND week_start >= date_trunc('week', p_start_date)::date
    AND week_start <= date_trunc('week', p_end_date)::date
  GROUP BY entity_type, entity_id
  ORDER BY entity_type, total_count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_listening_report_from_aggregates(UUID, DATE, DATE)
  TO service_role;
