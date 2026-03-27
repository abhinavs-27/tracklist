-- Hidden gems: entities with multiple distinct community listeners (for popularity-weighted ranking in app).

CREATE OR REPLACE FUNCTION get_community_hidden_gem_candidates(
  p_community_id UUID,
  p_entity_type TEXT,
  p_since TIMESTAMPTZ,
  p_min_listeners INT,
  p_candidate_limit INT
)
RETURNS TABLE (
  entity_id TEXT,
  unique_listeners BIGINT
)
LANGUAGE SQL
STABLE
AS $$
  WITH member_ids AS (
    SELECT cm.user_id
    FROM community_members cm
    WHERE cm.community_id = p_community_id
  ),
  logs_in_range AS (
    SELECT l.user_id, l.track_id, s.album_id, s.artist_id
    FROM logs l
    INNER JOIN member_ids m ON m.user_id = l.user_id
    INNER JOIN songs s ON s.id = l.track_id
    WHERE (p_since IS NULL OR l.listened_at >= p_since)
  ),
  entity_keys AS (
    SELECT
      CASE p_entity_type
        WHEN 'track' THEN l.track_id
        WHEN 'album' THEN l.album_id
        WHEN 'artist' THEN l.artist_id
      END AS entity_id,
      l.user_id
    FROM logs_in_range l
  ),
  filtered AS (
    SELECT entity_id, user_id
    FROM entity_keys
    WHERE entity_id IS NOT NULL
  ),
  agg AS (
    SELECT
      f.entity_id,
      COUNT(DISTINCT f.user_id)::bigint AS unique_listeners
    FROM filtered f
    GROUP BY f.entity_id
    HAVING COUNT(DISTINCT f.user_id) >= GREATEST(2, COALESCE(p_min_listeners, 2))
  )
  SELECT
    agg.entity_id::text,
    agg.unique_listeners
  FROM agg
  ORDER BY agg.unique_listeners DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_candidate_limit, 300), 1), 500);
$$;

COMMENT ON FUNCTION get_community_hidden_gem_candidates(UUID, TEXT, TIMESTAMPTZ, INT, INT) IS
  'Community entities with at least N distinct listeners in range (candidates for hidden-gems scoring).';

GRANT EXECUTE ON FUNCTION get_community_hidden_gem_candidates(UUID, TEXT, TIMESTAMPTZ, INT, INT) TO service_role;
