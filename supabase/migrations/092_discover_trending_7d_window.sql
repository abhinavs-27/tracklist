-- Trending: use rolling 7-day window (was 24h in 091) so charts stay populated with light traffic.

DROP MATERIALIZED VIEW IF EXISTS mv_trending_entities;

CREATE MATERIALIZED VIEW mv_trending_entities AS
SELECT
  l.track_id AS entity_id,
  'song'::TEXT AS entity_type,
  COUNT(*)::BIGINT AS listen_count
FROM logs l
WHERE l.listened_at >= NOW() - INTERVAL '7 days'
GROUP BY l.track_id
HAVING COUNT(*) >= 3
ORDER BY listen_count DESC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trending_entity_id ON mv_trending_entities (entity_id);

COMMENT ON MATERIALIZED VIEW mv_trending_entities IS
  'Top songs by log count in last 7 days (min 3 listens). Refreshed by refresh_discover_mvs().';

CREATE OR REPLACE FUNCTION get_trending_entities(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.track_id AS entity_id,
    'song'::TEXT AS entity_type,
    COUNT(*)::BIGINT AS listen_count
  FROM logs l
  WHERE l.listened_at >= NOW() - INTERVAL '7 days'
  GROUP BY l.track_id
  HAVING COUNT(*) >= 3
  ORDER BY listen_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;
