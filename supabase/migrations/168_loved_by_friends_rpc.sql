CREATE OR REPLACE FUNCTION get_loved_by_friends(
  p_viewer_id UUID,
  p_entity_type TEXT DEFAULT 'album',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  entity_id TEXT,
  entity_type TEXT,
  avg_friend_rating NUMERIC,
  friend_review_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.entity_id,
    r.entity_type,
    ROUND(AVG(r.rating)::numeric, 1) AS avg_friend_rating,
    COUNT(*)::bigint AS friend_review_count
  FROM reviews r
  INNER JOIN follows f
    ON f.following_id = r.user_id
    AND f.follower_id = p_viewer_id
  WHERE r.entity_type = p_entity_type
  GROUP BY r.entity_id, r.entity_type
  HAVING COUNT(*) >= 1
  ORDER BY avg_friend_rating DESC, friend_review_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$$;
