-- Community consensus: rank tracks/albums/artists by shared engagement (unique listeners + capped plays per user).

CREATE OR REPLACE FUNCTION get_community_consensus_rankings(
  p_community_id UUID,
  p_entity_type TEXT,
  p_since TIMESTAMPTZ,
  p_limit INT
)
RETURNS TABLE (
  entity_id TEXT,
  unique_listeners BIGINT,
  capped_plays BIGINT,
  total_plays BIGINT,
  score NUMERIC
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
  user_entity_counts AS (
    SELECT entity_id, user_id, COUNT(*)::BIGINT AS play_count
    FROM filtered
    GROUP BY entity_id, user_id
  ),
  agg AS (
    SELECT
      ue.entity_id,
      COUNT(DISTINCT ue.user_id)::BIGINT AS unique_listeners,
      COALESCE(SUM(LEAST(ue.play_count, 3::BIGINT)), 0)::BIGINT AS capped_plays,
      COALESCE(SUM(ue.play_count), 0)::BIGINT AS total_plays
    FROM user_entity_counts ue
    GROUP BY ue.entity_id
  )
  SELECT
    agg.entity_id::TEXT,
    agg.unique_listeners,
    agg.capped_plays,
    agg.total_plays,
    (agg.unique_listeners * 0.7 + agg.capped_plays * 0.3)::NUMERIC AS score
  FROM agg
  ORDER BY score DESC, agg.unique_listeners DESC, agg.entity_id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
$$;

COMMENT ON FUNCTION get_community_consensus_rankings(UUID, TEXT, TIMESTAMPTZ, INT) IS
  'Consensus rankings for a community: score = 0.7 * unique_listeners + 0.3 * sum(min(user plays, 3)).';

GRANT EXECUTE ON FUNCTION get_community_consensus_rankings(UUID, TEXT, TIMESTAMPTZ, INT) TO service_role;
