-- Consensus rankings: normalize by "active" community members (>= min plays in window)
-- so one heavy listener cannot dominate. Score = 0.7 * unique_listener_ratio + 0.3 * capped_play_ratio.

CREATE OR REPLACE FUNCTION get_community_consensus_rankings(
  p_community_id UUID,
  p_entity_type TEXT,
  p_since TIMESTAMPTZ,
  p_limit INT,
  p_offset INT
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
    INNER JOIN tracks s ON s.id = l.track_id
    WHERE (p_since IS NULL OR l.listened_at >= p_since)
  ),
  -- Users with at least this many total listens in the window count toward the denominator.
  active_users AS (
    SELECT GREATEST(
      COALESCE(
        (
          SELECT COUNT(*)::BIGINT
          FROM (
            SELECT user_id
            FROM logs_in_range
            GROUP BY user_id
            HAVING COUNT(*) >= 3
          ) t
        ),
        0::BIGINT
      ),
      1::BIGINT
    ) AS n
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
    (
      0.7 * (agg.unique_listeners::NUMERIC / au.n::NUMERIC)
      + 0.3 * (agg.capped_plays::NUMERIC / au.n::NUMERIC)
    )::NUMERIC AS score
  FROM agg
  CROSS JOIN active_users au
  ORDER BY score DESC, agg.unique_listeners DESC, agg.total_plays DESC, agg.entity_id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 101))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION get_community_consensus_rankings(UUID, TEXT, TIMESTAMPTZ, INT, INT) IS
  'Community consensus: active_users = members with >=3 listens in range (min 1). score = 0.7 * (unique_listeners/active_users) + 0.3 * (sum(min(user_plays,3))/active_users).';

GRANT EXECUTE ON FUNCTION get_community_consensus_rankings(UUID, TEXT, TIMESTAMPTZ, INT, INT) TO service_role;
