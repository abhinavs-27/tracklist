-- Migration 170: drop the old zero-argument overload of refresh_entity_stats.
--
-- Migration 158 replaced it with refresh_entity_stats(p_since TIMESTAMPTZ DEFAULT NULL),
-- which behaves identically when called with no arguments. Having both overloads
-- causes PGRST203 ("could not choose best candidate function") from PostgREST.

DROP FUNCTION IF EXISTS public.refresh_entity_stats();
