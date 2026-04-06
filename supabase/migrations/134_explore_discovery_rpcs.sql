-- Explore discovery: RPCs for dynamic sections (blowing up, most reviewed, most loved, hidden gems).
-- Read-heavy; pair with stale-first API cache. Optional index for time-window log scans.

CREATE INDEX IF NOT EXISTS idx_logs_listened_at_track
  ON public.logs (listened_at DESC, track_id);

-- Fast-rising tracks: growth = (curr_window - prev_window) / GREATEST(prev_window, 1)
CREATE OR REPLACE FUNCTION public.get_explore_blowing_up_tracks(
  p_range TEXT DEFAULT 'week',
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  track_id TEXT,
  curr_listens BIGINT,
  prev_listens BIGINT,
  growth NUMERIC,
  prev_rank INT,
  curr_rank INT
)
LANGUAGE sql
STABLE
AS $$
  WITH win AS (
    SELECT CASE
      WHEN lower(trim(p_range)) = '24h' THEN INTERVAL '24 hours'
      ELSE INTERVAL '7 days'
    END AS w
  ),
  curr_counts AS (
    SELECT l.track_id, COUNT(*)::bigint AS c
    FROM public.logs l
    CROSS JOIN win
    WHERE l.listened_at >= NOW() - (SELECT w FROM win)
    GROUP BY l.track_id
  ),
  prev_counts AS (
    SELECT l.track_id, COUNT(*)::bigint AS c
    FROM public.logs l
    CROSS JOIN win
    WHERE l.listened_at >= NOW() - 2 * (SELECT w FROM win)
      AND l.listened_at < NOW() - (SELECT w FROM win)
    GROUP BY l.track_id
  ),
  prev_ranked AS (
    SELECT p.track_id, ROW_NUMBER() OVER (ORDER BY p.c DESC)::int AS rnk
    FROM prev_counts p
  ),
  scored AS (
    SELECT
      c.track_id,
      c.c AS curr_listens,
      COALESCE(pr.c, 0)::bigint AS prev_listens,
      ((c.c - COALESCE(pr.c, 0))::numeric
        / GREATEST(COALESCE(pr.c, 0)::numeric, 1)) AS growth
    FROM curr_counts c
    LEFT JOIN prev_counts pr ON pr.track_id = c.track_id
    WHERE c.c >= 2
  ),
  ranked AS (
    SELECT
      s.track_id,
      s.curr_listens,
      s.prev_listens,
      s.growth,
      pr.rnk AS prev_rank,
      ROW_NUMBER() OVER (ORDER BY s.growth DESC, s.curr_listens DESC)::int AS curr_rank
    FROM scored s
    LEFT JOIN prev_ranked pr ON pr.track_id = s.track_id
  )
  SELECT r.track_id, r.curr_listens, r.prev_listens, r.growth, r.prev_rank, r.curr_rank
  FROM ranked r
  ORDER BY r.growth DESC, r.curr_listens DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

COMMENT ON FUNCTION public.get_explore_blowing_up_tracks IS
  'Tracks with highest listen growth vs the immediately preceding window (24h or 7d).';

-- Most reviews in the window + longest text snippet for quotes
CREATE OR REPLACE FUNCTION public.get_explore_most_reviewed_entities(
  p_range TEXT DEFAULT 'week',
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  entity_id TEXT,
  entity_type TEXT,
  review_count BIGINT,
  snippet TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH win AS (
    SELECT CASE
      WHEN lower(trim(p_range)) = '24h' THEN INTERVAL '24 hours'
      ELSE INTERVAL '7 days'
    END AS w
  ),
  agg AS (
    SELECT r.entity_id, r.entity_type, COUNT(*)::bigint AS rc
    FROM public.reviews r
    CROSS JOIN win
    WHERE r.created_at >= NOW() - (SELECT w FROM win)
    GROUP BY r.entity_id, r.entity_type
  )
  SELECT
    a.entity_id,
    a.entity_type,
    a.rc,
    (
      SELECT LEFT(TRIM(sn.review_text), 220)
      FROM public.reviews sn
      CROSS JOIN win
      WHERE sn.entity_id = a.entity_id
        AND sn.entity_type = a.entity_type
        AND sn.created_at >= NOW() - (SELECT w FROM win)
        AND LENGTH(TRIM(COALESCE(sn.review_text, ''))) > 0
      ORDER BY LENGTH(sn.review_text) DESC NULLS LAST
      LIMIT 1
    )::text AS snippet
  FROM agg a
  ORDER BY a.rc DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

COMMENT ON FUNCTION public.get_explore_most_reviewed_entities IS
  'Albums/songs with the most reviews in the window; optional review_text snippet.';

-- Saves (entity_stats) + plays + repeat listens in window
CREATE OR REPLACE FUNCTION public.get_explore_most_loved_tracks(
  p_range TEXT DEFAULT 'week',
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  track_id TEXT,
  window_listens BIGINT,
  repeat_extra BIGINT,
  favorite_count INT,
  love_score NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH win AS (
    SELECT CASE
      WHEN lower(trim(p_range)) = '24h' THEN INTERVAL '24 hours'
      ELSE INTERVAL '7 days'
    END AS w
  ),
  plays AS (
    SELECT l.track_id, COUNT(*)::bigint AS c
    FROM public.logs l
    CROSS JOIN win
    WHERE l.listened_at >= NOW() - (SELECT w FROM win)
    GROUP BY l.track_id
  ),
  repeats AS (
    SELECT
      l.track_id,
      GREATEST(COUNT(*)::bigint - COUNT(DISTINCT l.user_id)::bigint, 0::bigint) AS rpt
    FROM public.logs l
    CROSS JOIN win
    WHERE l.listened_at >= NOW() - (SELECT w FROM win)
    GROUP BY l.track_id
  )
  SELECT
    p.track_id,
    p.c AS window_listens,
    COALESCE(r.rpt, 0::bigint) AS repeat_extra,
    COALESCE(es.favorite_count, 0)::int AS favorite_count,
    (
      COALESCE(es.favorite_count, 0)::numeric * 4
      + p.c::numeric
      + COALESCE(r.rpt, 0::bigint)::numeric * 2
    ) AS love_score
  FROM plays p
  LEFT JOIN repeats r ON r.track_id = p.track_id
  LEFT JOIN public.entity_stats es
    ON es.entity_type = 'song' AND es.entity_id = p.track_id
  ORDER BY love_score DESC, p.c DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

COMMENT ON FUNCTION public.get_explore_most_loved_tracks IS
  'Tracks ranked by favorites + window plays + repeat listens (extra plays beyond first per user).';

-- High review engagement relative to total catalog plays (entity_stats)
CREATE OR REPLACE FUNCTION public.get_explore_hidden_gems_entities(
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  entity_id TEXT,
  entity_type TEXT,
  play_count INT,
  review_count INT,
  avg_rating NUMERIC,
  gem_score NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.entity_id,
    e.entity_type,
    e.play_count,
    e.review_count,
    e.avg_rating,
    (
      (COALESCE(e.review_count, 0)::numeric * COALESCE(e.avg_rating, 0))
      / NULLIF(LN(GREATEST(e.play_count, 1)::numeric + 1), 0)
    ) AS gem_score
  FROM public.entity_stats e
  WHERE e.entity_type IN ('song', 'album')
    AND e.review_count >= 1
    AND e.play_count <= 400
    AND e.avg_rating IS NOT NULL
    AND e.avg_rating >= 3.8
  ORDER BY gem_score DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

COMMENT ON FUNCTION public.get_explore_hidden_gems_entities IS
  'High review engagement vs modest total plays (catalog-wide entity_stats).';

GRANT EXECUTE ON FUNCTION public.get_explore_blowing_up_tracks(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_explore_most_reviewed_entities(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_explore_most_loved_tracks(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_explore_hidden_gems_entities(INT) TO anon, authenticated;
