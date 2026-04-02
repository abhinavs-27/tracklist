-- Aggregated like counts + whether the viewer liked each review (GET /api/reviews).

CREATE OR REPLACE FUNCTION public.get_review_like_stats(
  p_review_ids UUID[],
  p_viewer_id UUID
)
RETURNS TABLE (
  review_id UUID,
  like_count BIGINT,
  viewer_liked BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    r.review_id,
    COUNT(l.id)::bigint AS like_count,
    COALESCE(
      bool_or(p_viewer_id IS NOT NULL AND l.user_id = p_viewer_id),
      false
    ) AS viewer_liked
  FROM unnest(p_review_ids) AS r(review_id)
  LEFT JOIN likes l ON l.review_id = r.review_id
  GROUP BY r.review_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_review_like_stats(UUID[], UUID)
  TO anon, authenticated, service_role;
