-- Batched play counts for many track_ids (artist album aggregation, etc.).
-- Avoids loading full log rows into the app.

CREATE OR REPLACE FUNCTION public.count_logs_by_track_ids(p_track_ids text[])
RETURNS TABLE (track_id text, play_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT l.track_id, COUNT(*)::bigint
  FROM logs l
  WHERE l.track_id = ANY(p_track_ids)
  GROUP BY l.track_id;
$$;
