-- All-time entity totals were timing out (statement_timeout) for 100k+ log users,
-- e.g. get_user_entity_totals('album', ...) took ~8.7s and was cancelled. That made
-- computeTasteIdentity's strict aggregate reads throw and abort the taste refresh, so
-- the heaviest users' taste_identity_cache could never be (re)built.
--
-- Root cause: the RPC filters WHERE week_start IS NULL (all-time rows) ORDER BY count
-- DESC, but every existing index on user_listening_aggregates is partial on
-- week_start IS NOT NULL / month IS NOT NULL / year IS NOT NULL — none covers the
-- all-time rows. The query fell back to the unique bucket index and read every
-- all-time row (tens of thousands) + top-N sort.
--
-- Two-part fix:
--   1. Partial index covering exactly the all-time predicate, ordered by count DESC.
--   2. Order the RPC by the raw "count" column instead of the ::bigint alias, so the
--      planner can satisfy the ORDER BY from the index and read only LIMIT rows
--      (pure index scan) instead of a full read + sort. Result is identical — the
--      cast is monotonic. Measured: ~3.8s/8.7s -> <1ms.

-- 1. Index for the all-time (week_start IS NULL) read path.
-- NOTE: created CONCURRENTLY on the live DB out-of-band; IF NOT EXISTS makes this a
-- no-op there. Fresh environments create it here (brief lock, acceptable on empty/new).
CREATE INDEX IF NOT EXISTS idx_ula_user_type_alltime
  ON public.user_listening_aggregates (user_id, entity_type, "count" DESC)
  WHERE week_start IS NULL;

-- 2. Order by the raw column so the index serves the ordering.
CREATE OR REPLACE FUNCTION public.get_user_entity_totals(
  p_user_id uuid,
  p_entity_type text,
  p_limit integer DEFAULT 50
)
  RETURNS TABLE(entity_id text, total_count bigint)
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
AS $function$
  SELECT entity_id, "count"::BIGINT AS total_count
  FROM user_listening_aggregates
  WHERE user_id = p_user_id
    AND entity_type = p_entity_type
    AND week_start IS NULL
  ORDER BY "count" DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$function$;
