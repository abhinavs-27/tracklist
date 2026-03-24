-- Users with listening logs but no taste_identity_cache row yet (cron seeds these first).

CREATE OR REPLACE FUNCTION public.user_ids_without_taste_identity_cache(p_limit int)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT l.user_id
  FROM logs l
  WHERE NOT EXISTS (
    SELECT 1 FROM taste_identity_cache t WHERE t.user_id = l.user_id
  )
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.user_ids_without_taste_identity_cache(int) IS
  'Candidates for taste_identity_cache backfill (cron).';
