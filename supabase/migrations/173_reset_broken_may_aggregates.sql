-- Reset broken aggregate data for May 2026.
--
-- Root cause: loadAggregateCatalogForLogs did a single un-chunked .in() for all
-- unique track IDs in a batch. Batches with 100+ unique tracks exceeded PostgREST's
-- ~8KB URL limit, silently returning empty data. This left songByTrack empty so
-- artist/album IDs could not be resolved — only track bumps were recorded.
--
-- This migration wipes the broken May weekly/monthly aggregate rows and the ingest
-- markers for those logs so the fixed cron code can reprocess them correctly.
-- After applying, trigger /api/cron/listening-aggregates multiple times to rebuild.

-- 1. Delete aggregate rows for all of May (weekly + monthly buckets).
--    Yearly buckets (week_start IS NULL AND month IS NULL) are left intact —
--    the next reprocessing will add correct deltas on top of them.
DELETE FROM user_listening_aggregates
WHERE week_start >= '2026-05-04'
   OR month = '2026-05-01';

-- 2. Clear ingest markers so those logs are treated as unprocessed.
DELETE FROM user_listening_aggregate_ingest
WHERE log_id IN (
  SELECT id FROM logs
  WHERE created_at >= '2026-05-01 00:00:00+00'
);

-- 3. Reset watermark to end of April so the cron picks up from May 1.
UPDATE aggregate_ingest_watermark
SET
  last_processed_created_at = '2026-04-30 23:59:59+00',
  last_processed_listened_at = '2026-04-30 23:59:59+00',
  last_processed_log_id = (
    SELECT id FROM logs
    WHERE created_at < '2026-05-01 00:00:00+00'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  );
