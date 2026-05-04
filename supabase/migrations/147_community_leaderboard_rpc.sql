-- Replaces the JS row-fetch approach with a DB aggregation.
-- Eliminates the 40k row limit that silently dropped newer logs.
-- Returns per-member: total log count, unique artist count, distinct listen days.

CREATE OR REPLACE FUNCTION get_community_weekly_leaderboard(
  p_community_id UUID,
  p_since        TIMESTAMPTZ
)
RETURNS TABLE (
  user_id        UUID,
  total_logs     BIGINT,
  unique_artists BIGINT,
  listen_days    TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.user_id,
    COUNT(l.id)                                                          AS total_logs,
    COUNT(DISTINCT COALESCE(l.artist_id, t.artist_id))                  AS unique_artists,
    ARRAY_AGG(DISTINCT (l.listened_at AT TIME ZONE 'UTC')::date::text)  AS listen_days
  FROM logs l
  LEFT JOIN tracks t ON t.id = l.track_id
  WHERE l.user_id IN (
    SELECT user_id FROM community_members WHERE community_id = p_community_id
  )
    AND l.listened_at >= p_since
  GROUP BY l.user_id
$$;
