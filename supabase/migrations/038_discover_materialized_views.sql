-- Discovery materialized views: pre-aggregate trending, rising artists, hidden gems.
-- Refreshed periodically (e.g. every 10 min) via refresh_discover_mvs().
-- App reads from MV first (RPCs below), falls back to live RPCs on miss.

-- Top entities by listen count in last 24 hours (up to 50 rows).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_trending_entities AS
SELECT
  l.track_id AS entity_id,
  'song'::TEXT AS entity_type,
  COUNT(*)::BIGINT AS listen_count
FROM logs l
WHERE l.listened_at >= NOW() - INTERVAL '24 hours'
GROUP BY l.track_id
ORDER BY listen_count DESC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_trending_entity_id ON mv_trending_entities (entity_id);

-- Rising artists: 7-day growth (current 7d listens minus previous 7d). Up to 50 rows.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_rising_artists AS
WITH window_days AS (SELECT 7 AS d),
current_window AS (
  SELECT s.artist_id, COUNT(*)::BIGINT AS c
  FROM logs l
  INNER JOIN songs s ON l.track_id = s.id
  CROSS JOIN window_days w
  WHERE l.listened_at >= NOW() - (w.d || ' days')::INTERVAL
  GROUP BY s.artist_id
),
previous_window AS (
  SELECT s.artist_id, COUNT(*)::BIGINT AS c
  FROM logs l
  INNER JOIN songs s ON l.track_id = s.id
  CROSS JOIN window_days w
  WHERE l.listened_at >= NOW() - (2 * w.d || ' days')::INTERVAL
    AND l.listened_at < NOW() - (w.d || ' days')::INTERVAL
  GROUP BY s.artist_id
)
SELECT
  a.id AS artist_id,
  a.name,
  a.image_url AS avatar_url,
  (COALESCE(cw.c, 0) - COALESCE(pw.c, 0))::BIGINT AS growth
FROM artists a
LEFT JOIN current_window cw ON a.id = cw.artist_id
LEFT JOIN previous_window pw ON a.id = pw.artist_id
WHERE (COALESCE(cw.c, 0) - COALESCE(pw.c, 0)) > 0
ORDER BY growth DESC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_rising_artists_artist_id ON mv_rising_artists (artist_id);

-- Hidden gems: avg_rating >= 4, listen_count <= 50. Up to 50 rows.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hidden_gems AS
WITH review_stats AS (
  SELECT
    r.entity_id,
    r.entity_type,
    AVG(r.rating)::NUMERIC(3,2) AS avg_rating
  FROM reviews r
  WHERE r.entity_type IN ('album', 'song')
  GROUP BY r.entity_id, r.entity_type
  HAVING AVG(r.rating) >= 4
),
listen_counts AS (
  SELECT rs.entity_id, rs.entity_type, rs.avg_rating,
    (
      CASE WHEN rs.entity_type = 'song' THEN
        (SELECT COUNT(*)::BIGINT FROM logs WHERE track_id = rs.entity_id)
      ELSE
        (SELECT COUNT(*)::BIGINT FROM logs l INNER JOIN songs s ON l.track_id = s.id WHERE s.album_id = rs.entity_id)
      END
    ) AS listen_count
  FROM review_stats rs
)
SELECT entity_id, entity_type, avg_rating, listen_count
FROM listen_counts
WHERE listen_count <= 50
ORDER BY avg_rating DESC, listen_count ASC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_hidden_gems_entity ON mv_hidden_gems (entity_id, entity_type);

-- Refresh all discovery MVs (use CONCURRENTLY so reads can continue). Call from cron every 5–15 min.
CREATE OR REPLACE FUNCTION refresh_discover_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_trending_entities;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_rising_artists;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hidden_gems;
END;
$$;

-- RPCs that read from MVs (used by app when cache layer prefers MV over live query).
CREATE OR REPLACE FUNCTION get_trending_entities_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.entity_id, m.entity_type, m.listen_count
  FROM mv_trending_entities m
  ORDER BY m.listen_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION get_rising_artists_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (artist_id TEXT, name TEXT, avatar_url TEXT, growth BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.artist_id, m.name, m.avatar_url, m.growth
  FROM mv_rising_artists m
  ORDER BY m.growth DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION get_hidden_gems_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, avg_rating NUMERIC, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.entity_id, m.entity_type, m.avg_rating, m.listen_count
  FROM mv_hidden_gems m
  ORDER BY m.avg_rating DESC, m.listen_count ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;
