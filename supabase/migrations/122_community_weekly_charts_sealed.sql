-- Once sealed, incremental cron skips recomputing that week (immutable published chart).
-- Backfill passes skipIfSealed=false to refresh history.

ALTER TABLE public.community_weekly_charts
  ADD COLUMN IF NOT EXISTS sealed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.community_weekly_charts.sealed_at IS
  'Set when the chart row is first written; cron skips re-aggregation for sealed rows.';
