-- Add a real "all-time" bucket to user_listening_aggregates.
--
-- Background: every "all-time" read — fetchArtistViewerStats (artist social tab),
-- the track/album/artist friend leaderboards, and the get_user_entity_totals RPC
-- (taste identity) — targets the row WHERE week_start IS NULL. But chk_ula_bucket_one
-- FORBADE an all-null row, so that row never existed: "week_start IS NULL" actually
-- matched the monthly + yearly buckets (which also have week_start NULL). It only
-- appeared to work while each entity had a single such row. Once inline aggregate
-- writes began emitting fresh month + year buckets per listen, any recently-played
-- entity accumulated >1 week_start-NULL row, so .maybeSingle() erred and the stat
-- read 0 (e.g. a user's #2/#3 artists showed zero plays).
--
-- Fix: allow the all-time bucket, backfill it from the WEEKLY buckets (the complete,
-- verified ground truth — monthly/yearly buckets are partially corrupted by an old
-- bulk import and must NOT be summed), and point the all-time index + RPCs at the
-- true all-null predicate. The write path now also emits this bucket per listen
-- (lib/analytics/listening-aggregate-deltas.ts), and the unique index is
-- NULLS NOT DISTINCT so (NULL,NULL,NULL) upserts to a single row.
--
-- NOTE: reads must ship with this — they now filter week_start AND month AND year
-- IS NULL. Applying this migration WITHOUT the matching code makes reads match the
-- new all-time row PLUS the month/year rows and break harder. Deploy together.

-- 1. Allow the all-time bucket (week_start / month / year all NULL). Relaxing only
--    adds a permitted case, so every existing row still satisfies the constraint.
ALTER TABLE user_listening_aggregates DROP CONSTRAINT IF EXISTS chk_ula_bucket_one;
ALTER TABLE user_listening_aggregates ADD CONSTRAINT chk_ula_bucket_one CHECK (
  (week_start IS NOT NULL AND month IS NULL AND year IS NULL)
  OR (week_start IS NULL AND month IS NOT NULL AND year IS NULL)
  OR (week_start IS NULL AND month IS NULL AND year IS NOT NULL)
  OR (week_start IS NULL AND month IS NULL AND year IS NULL)   -- all-time
);

-- 2. Backfill all-time rows = SUM of weekly buckets per (user, entity_type, entity_id).
--    Idempotent: the unique index is NULLS NOT DISTINCT, so (NULL,NULL,NULL) is one
--    key; re-running overwrites with the fresh weekly sum.
--    NOTE: on the live DB this single statement (~713k weekly rows -> ~167k all-time
--    rows) exceeds statement_timeout, so it was applied out-of-band in per-entity_type
--    (and hash-bucketed) chunks. On a fresh/empty environment there's no data, so this
--    one statement is fast; kept here as the version-controlled definition.
INSERT INTO user_listening_aggregates (user_id, entity_type, entity_id, count, week_start, month, year)
SELECT user_id, entity_type, entity_id, SUM(count)::int, NULL, NULL, NULL
FROM user_listening_aggregates
WHERE week_start IS NOT NULL
GROUP BY user_id, entity_type, entity_id
ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
DO UPDATE SET count = EXCLUDED.count, updated_at = now();

-- 3. Repoint the all-time partial index from "week_start IS NULL" (which covered
--    monthly + yearly rows) to the true all-null predicate.
DROP INDEX IF EXISTS idx_ula_user_type_alltime;
CREATE INDEX IF NOT EXISTS idx_ula_user_type_alltime
  ON user_listening_aggregates (user_id, entity_type, "count" DESC)
  WHERE week_start IS NULL AND month IS NULL AND year IS NULL;

-- 4. Entity-totals RPC reads the single true all-time row per entity (index scan).
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
    AND week_start IS NULL AND month IS NULL AND year IS NULL
  ORDER BY "count" DESC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$function$;

-- 5. Total play count from the all-time track rows (previously summed yearly rows,
--    which are incomplete). One row per track now, but SUM stays correct.
CREATE OR REPLACE FUNCTION public.get_user_total_play_count(p_user_id uuid)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(count), 0)::BIGINT
  FROM user_listening_aggregates
  WHERE user_id = p_user_id
    AND entity_type = 'track'
    AND week_start IS NULL AND month IS NULL AND year IS NULL;
$function$;
