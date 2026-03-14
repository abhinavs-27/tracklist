-- Discovery: trending (24h), rising artists, hidden gems. All aggregation in DB.

-- Trending: top entities by listen count in last 24 hours. Returns songs (track_id).
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
  WHERE l.listened_at >= NOW() - INTERVAL '24 hours'
  GROUP BY l.track_id
  ORDER BY listen_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

-- Rising artists: growth = listens in current window minus previous window.
CREATE OR REPLACE FUNCTION get_rising_artists(p_limit INT DEFAULT 20, p_window_days INT DEFAULT 7)
RETURNS TABLE (artist_id TEXT, name TEXT, avatar_url TEXT, growth BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH window_days AS (SELECT LEAST(GREATEST(COALESCE(p_window_days, 7), 1), 90) AS d),
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
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

-- Hidden gems: highly rated (avg >= min_rating) but low listen count (<= max_listens).
CREATE OR REPLACE FUNCTION get_hidden_gems(
  p_limit INT DEFAULT 20,
  p_min_rating NUMERIC DEFAULT 4,
  p_max_listens INT DEFAULT 50
)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, avg_rating NUMERIC, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH review_stats AS (
    SELECT
      r.entity_id,
      r.entity_type,
      AVG(r.rating)::NUMERIC(3,2) AS avg_rating
    FROM reviews r
    WHERE r.entity_type IN ('album', 'song')
    GROUP BY r.entity_id, r.entity_type
    HAVING AVG(r.rating) >= LEAST(GREATEST(COALESCE(p_min_rating, 4), 0), 5)
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
  WHERE listen_count <= LEAST(GREATEST(COALESCE(p_max_listens, 50), 0), 10000)
  ORDER BY avg_rating DESC, listen_count ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;
