-- 193_cooccurrence_pgcron.sql
--
-- compute_cooccurrence ran via the SQS worker -> Supabase Data-API RPC, but the
-- album half genuinely takes >120s and was cut off by the Data API's ~120s gateway
-- timeout (SQLSTATE-less "upstream request timeout") every run — even though the
-- function itself completes server-side (its SET LOCAL statement_timeout is 300s).
--
-- Fix: run the computation entirely inside Postgres via pg_cron, where no gateway
-- timeout applies. A wrapper function runs both halves under a generous 900s budget.
-- The matching EventBridge rule (tracklist-cron-compute-cooccurrence) is disabled so
-- the SQS path no longer churns.

-- Wrapper: run both cooccurrence halves in one in-DB call (schema object — always applied).
CREATE OR REPLACE FUNCTION public.run_compute_cooccurrence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM compute_song_cooccurrence_in_db();
  PERFORM compute_album_cooccurrence_in_db();
END;
$function$;

-- Schedule via pg_cron. Guarded so environments without pg_cron (local/CI) no-op
-- instead of failing the migration. cron.schedule upserts by name, so this is idempotent.
--
-- The cron command raises statement_timeout as its own leading statement rather than
-- relying on a function-level SET: pg_cron runs as `postgres` (which inherits the 120s
-- DB default) and a proconfig/SET inside the called function does NOT re-arm the
-- already-started top-level statement's timer in pg_cron's execution context. Setting
-- it as a prior statement means the SELECT is armed at 900s from its own start.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule(
      'compute-cooccurrence-weekly',
      '30 3 * * 0', -- Sundays 03:30 UTC (matches the retired EventBridge schedule)
      $job$SET statement_timeout='900s'; SELECT public.run_compute_cooccurrence();$job$
    );
  ELSE
    RAISE NOTICE 'pg_cron unavailable — skipping compute-cooccurrence-weekly schedule';
  END IF;
END
$do$;
