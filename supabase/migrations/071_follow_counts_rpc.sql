-- Single round-trip for follower/following counts (profile + API).
-- Replaces two parallel PostgREST head count requests.

CREATE OR REPLACE FUNCTION public.get_follow_counts(p_user_id uuid)
RETURNS TABLE (followers_count bigint, following_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM follows WHERE following_id = p_user_id),
    (SELECT COUNT(*)::bigint FROM follows WHERE follower_id = p_user_id);
$$;
