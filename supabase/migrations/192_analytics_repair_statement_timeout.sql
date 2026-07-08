-- 192_analytics_repair_statement_timeout.sql
--
-- The artist-aggregate repair RPCs do batch backfill work (up to 50k rows/call)
-- and legitimately run longer than the service_role 30s statement_timeout. With
-- the correct (secret) service_role key restored, they now reach 30s and are
-- cancelled (SQLSTATE 57014) mid-repair instead of finishing. Give them a
-- generous function-level statement_timeout (well under the Lambda's 900s limit),
-- matching the approach used for refresh_entity_stats in migration 191.

ALTER FUNCTION public.repair_missing_artist_aggregates(integer, uuid)
  SET statement_timeout TO '240s';

ALTER FUNCTION public.repair_orphaned_artist_aggregates(uuid)
  SET statement_timeout TO '240s';
