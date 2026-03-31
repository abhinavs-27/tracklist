-- Recreate RPCs, triggers, and discovery MVs after 101_canonical_music_entities.sql (tracks + UUID ids).

DROP FUNCTION IF EXISTS public.count_logs_by_track_ids(text[]);

-- CREATE OR REPLACE cannot change OUT params / RETURN TABLE column types. Drop functions whose
-- signatures or row types changed from pre-101 (TEXT catalog ids → UUID).
DROP FUNCTION IF EXISTS get_album_recommendations(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_album_recommendations(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_user_recommendations(UUID, INTEGER);
DROP FUNCTION IF EXISTS generate_weekly_report(UUID);
DROP FUNCTION IF EXISTS get_period_report(UUID, TEXT, INTEGER);

-- ---------------------------------------------------------------------------
-- Entity stats refresh (was 089; uses tracks + UUID reviews)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_entity_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO album_stats (album_id, avg_rating, review_count, listen_count, rating_distribution, last_updated)
  SELECT
    a.album_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    COALESCE(r.rating_distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb),
    NOW()
  FROM (
    SELECT DISTINCT album_id FROM tracks WHERE album_id IS NOT NULL
    UNION
    SELECT DISTINCT entity_id FROM reviews
    WHERE entity_type = 'album' AND entity_id IS NOT NULL
  ) a
  LEFT JOIN (
    SELECT
      entity_id AS album_id,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*)::int AS review_count,
      jsonb_build_object(
        '1', COUNT(*) FILTER (WHERE rating = 1),
        '2', COUNT(*) FILTER (WHERE rating = 2),
        '3', COUNT(*) FILTER (WHERE rating = 3),
        '4', COUNT(*) FILTER (WHERE rating = 4),
        '5', COUNT(*) FILTER (WHERE rating = 5)
      ) AS rating_distribution
    FROM reviews
    WHERE entity_type = 'album'
    GROUP BY entity_id
  ) r ON r.album_id = a.album_id
  LEFT JOIN (
    SELECT s.album_id, COUNT(l.id)::int AS listen_count
    FROM logs l
    JOIN tracks s ON s.id = l.track_id
    WHERE s.album_id IS NOT NULL
    GROUP BY s.album_id
  ) l ON l.album_id = a.album_id
  ON CONFLICT (album_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    rating_distribution = EXCLUDED.rating_distribution,
    last_updated = NOW();

  INSERT INTO track_stats (track_id, avg_rating, review_count, listen_count, last_updated)
  SELECT
    t.track_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    NOW()
  FROM (
    SELECT DISTINCT track_id FROM logs WHERE track_id IS NOT NULL
    UNION
    SELECT DISTINCT entity_id FROM reviews
    WHERE entity_type = 'song' AND entity_id IS NOT NULL
  ) t
  LEFT JOIN (
    SELECT
      entity_id AS track_id,
      ROUND(AVG(rating)::numeric, 1) AS avg_rating,
      COUNT(*)::int AS review_count
    FROM reviews
    WHERE entity_type = 'song'
    GROUP BY entity_id
  ) r ON r.track_id = t.track_id
  LEFT JOIN (
    SELECT track_id, COUNT(*)::int AS listen_count
    FROM logs
    WHERE track_id IS NOT NULL
    GROUP BY track_id
  ) l ON l.track_id = t.track_id
  ON CONFLICT (track_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    last_updated = NOW();
END;
$$;

-- ---------------------------------------------------------------------------
-- increment_entity_* (UUID entity ids)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS increment_entity_play_count(TEXT, TEXT);
DROP FUNCTION IF EXISTS increment_entity_review_count(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS increment_entity_favorite_count(TEXT, TEXT);

CREATE OR REPLACE FUNCTION increment_entity_play_count(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  VALUES (p_entity_type, p_entity_id, 1, 0, NULL, 0, NOW())
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    play_count = entity_stats.play_count + 1,
    updated_at = NOW();
$$;

CREATE OR REPLACE FUNCTION increment_entity_review_count(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_rating INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  VALUES (p_entity_type, p_entity_id, 0, 1, p_rating, 0, NOW())
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    review_count = entity_stats.review_count + 1,
    avg_rating = ROUND(
      (
        COALESCE(entity_stats.avg_rating, p_rating)::numeric * GREATEST(entity_stats.review_count, 0)
        + p_rating
      ) / (GREATEST(entity_stats.review_count, 0) + 1),
      1
    ),
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION increment_entity_favorite_count(
  p_entity_type TEXT,
  p_entity_id UUID
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  VALUES (p_entity_type, p_entity_id, 0, 0, NULL, 1, NOW())
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    favorite_count = entity_stats.favorite_count + 1,
    updated_at = NOW();
$$;

CREATE OR REPLACE FUNCTION sync_favorite_counts_from_user_favorite_albums()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  SELECT
    'album',
    album_id,
    0,
    0,
    NULL,
    COUNT(*)::int,
    NOW()
  FROM user_favorite_albums
  GROUP BY album_id
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    favorite_count = EXCLUDED.favorite_count,
    updated_at = NOW();

  UPDATE entity_stats es
  SET favorite_count = 0, updated_at = NOW()
  WHERE es.entity_type = 'album'
    AND es.favorite_count > 0
    AND NOT EXISTS (
      SELECT 1 FROM user_favorite_albums ufa WHERE ufa.album_id = es.entity_id
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Batched log counts by track UUIDs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_logs_by_track_ids(p_track_ids uuid[])
RETURNS TABLE (track_id uuid, play_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT l.track_id, COUNT(*)::bigint
  FROM logs l
  WHERE l.track_id = ANY(p_track_ids)
  GROUP BY l.track_id;
$$;

-- ---------------------------------------------------------------------------
-- User daily stats trigger (tracks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_user_daily_stats(p_user_id UUID, p_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_daily_stats (
    user_id,
    date,
    listen_count,
    unique_tracks,
    unique_artists,
    minutes_listened
  )
  SELECT
    p_user_id AS user_id,
    p_date AS date,
    COUNT(*)::INT AS listen_count,
    COUNT(DISTINCT l.track_id)::INT AS unique_tracks,
    COUNT(DISTINCT s.artist_id)::INT AS unique_artists,
    COALESCE(
      ROUND(SUM(COALESCE(s.duration_ms, 0)) / 60000.0)::INT,
      0
    ) AS minutes_listened
  FROM logs l
  LEFT JOIN tracks s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at::DATE = p_date
  GROUP BY p_user_id, p_date
  ON CONFLICT (user_id, date) DO UPDATE
  SET
    listen_count = EXCLUDED.listen_count,
    unique_tracks = EXCLUDED.unique_tracks,
    unique_artists = EXCLUDED.unique_artists,
    minutes_listened = EXCLUDED.minutes_listened;
END;
$$;

-- ---------------------------------------------------------------------------
-- Activity feed (UUID entity ids → TEXT for clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_activity_feed(
  p_user_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  event_type TEXT,
  event_id UUID,
  actor_id UUID,
  entity_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH following AS (
    SELECT following_id
    FROM follows
    WHERE follower_id = p_user_id
  )
  SELECT
    'review' AS event_type,
    r.id AS event_id,
    r.user_id AS actor_id,
    r.entity_id::text AS entity_id,
    r.created_at
  FROM reviews r
  WHERE r.user_id IN (SELECT following_id FROM following)
    AND (p_cursor IS NULL OR r.created_at < p_cursor)

  UNION ALL

  SELECT
    'follow' AS event_type,
    f2.id AS event_id,
    f2.follower_id AS actor_id,
    f2.following_id::text AS entity_id,
    f2.created_at
  FROM follows f2
  INNER JOIN follows f1 ON f2.follower_id = f1.following_id
  WHERE f1.follower_id = p_user_id
    AND (p_cursor IS NULL OR f2.created_at < p_cursor)

  UNION ALL

  SELECT
    'listen' AS event_type,
    l.id AS event_id,
    l.user_id AS actor_id,
    l.track_id::text AS entity_id,
    l.listened_at AS created_at
  FROM logs l
  WHERE l.user_id IN (SELECT following_id FROM following)
    AND (p_cursor IS NULL OR l.listened_at < p_cursor)

  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

-- ---------------------------------------------------------------------------
-- Recommendations (album id = UUID)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_album_recommendations(
  p_album_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  album_id UUID,
  score BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH target_users AS (
    SELECT DISTINCT l.user_id
    FROM logs l
    INNER JOIN tracks s ON s.id = l.track_id
    WHERE s.album_id = p_album_id
  ),
  co_listens AS (
    SELECT
      s.album_id AS recommended_album_id,
      COUNT(*)::BIGINT AS score
    FROM logs l
    INNER JOIN tracks s ON s.id = l.track_id
    WHERE l.user_id IN (SELECT target_users.user_id FROM target_users)
      AND s.album_id IS NOT NULL
      AND s.album_id != p_album_id
    GROUP BY s.album_id
  )
  SELECT
    co_listens.recommended_album_id AS album_id,
    co_listens.score
  FROM co_listens
  ORDER BY co_listens.score DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 20));
$$;

CREATE OR REPLACE FUNCTION get_user_recommendations(
  p_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  album_id UUID,
  score BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH user_albums AS (
    SELECT DISTINCT s.album_id
    FROM logs l
    INNER JOIN tracks s ON s.id = l.track_id
    WHERE l.user_id = p_user_id
      AND s.album_id IS NOT NULL
  ),
  co_listeners AS (
    SELECT DISTINCT l.user_id
    FROM logs l
    INNER JOIN tracks s ON s.id = l.track_id
    WHERE s.album_id IN (SELECT user_albums.album_id FROM user_albums)
      AND l.user_id != p_user_id
  ),
  recommended AS (
    SELECT
      s.album_id AS recommended_album_id,
      COUNT(*)::BIGINT AS score
    FROM logs l
    INNER JOIN tracks s ON s.id = l.track_id
    WHERE l.user_id IN (SELECT co_listeners.user_id FROM co_listeners)
      AND s.album_id IS NOT NULL
      AND s.album_id NOT IN (SELECT user_albums.album_id FROM user_albums)
    GROUP BY s.album_id
  )
  SELECT
    recommended.recommended_album_id AS album_id,
    recommended.score
  FROM recommended
  ORDER BY recommended.score DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 20));
$$;

-- ---------------------------------------------------------------------------
-- Weekly + period reports
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_weekly_report(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  week_start DATE,
  listen_count INTEGER,
  top_artist_id UUID,
  top_album_id UUID,
  top_track_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_week_start DATE;
  v_listen_count INTEGER;
  v_top_artist_id UUID;
  v_top_album_id UUID;
  v_top_track_id UUID;
  v_report_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  v_week_start := (current_date AT TIME ZONE 'UTC') - interval '7 days';
  v_week_start := v_week_start::date;

  SELECT COUNT(*)::INTEGER INTO v_listen_count
  FROM logs l
  WHERE l.user_id = p_user_id
    AND l.listened_at >= (v_week_start::timestamp AT TIME ZONE 'UTC')
    AND l.listened_at < (current_date::timestamp AT TIME ZONE 'UTC');

  SELECT s.artist_id INTO v_top_artist_id
  FROM logs l
  INNER JOIN tracks s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at >= (v_week_start::timestamp AT TIME ZONE 'UTC')
    AND l.listened_at < (current_date::timestamp AT TIME ZONE 'UTC')
  GROUP BY s.artist_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT s.album_id INTO v_top_album_id
  FROM logs l
  INNER JOIN tracks s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at >= (v_week_start::timestamp AT TIME ZONE 'UTC')
    AND l.listened_at < (current_date::timestamp AT TIME ZONE 'UTC')
  GROUP BY s.album_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT l.track_id INTO v_top_track_id
  FROM logs l
  WHERE l.user_id = p_user_id
    AND l.listened_at >= (v_week_start::timestamp AT TIME ZONE 'UTC')
    AND l.listened_at < (current_date::timestamp AT TIME ZONE 'UTC')
  GROUP BY l.track_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  v_report_id := gen_random_uuid();
  v_created_at := now();
  INSERT INTO weekly_reports (id, user_id, week_start, listen_count, top_artist_id, top_album_id, top_track_id, created_at)
  VALUES (v_report_id, p_user_id, v_week_start, v_listen_count, v_top_artist_id, v_top_album_id, v_top_track_id, v_created_at);

  id := v_report_id;
  user_id := p_user_id;
  week_start := v_week_start;
  listen_count := v_listen_count;
  top_artist_id := v_top_artist_id;
  top_album_id := v_top_album_id;
  top_track_id := v_top_track_id;
  created_at := v_created_at;
  RETURN NEXT;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION get_period_report(
  p_user_id UUID,
  p_period_type TEXT,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  period_start DATE,
  period_end DATE,
  period_label TEXT,
  listen_count INTEGER,
  top_artist_id UUID,
  top_album_id UUID,
  top_track_id UUID
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_label TEXT;
  v_listen_count INTEGER;
  v_top_artist_id UUID;
  v_top_album_id UUID;
  v_top_track_id UUID;
  v_ts_start TIMESTAMPTZ;
  v_ts_end TIMESTAMPTZ;
  v_off INT;
BEGIN
  v_off := GREATEST(0, COALESCE(p_offset, 0));

  IF p_period_type = 'week' THEN
    v_period_start := (date_trunc('week', (current_date AT TIME ZONE 'UTC'))::date - (v_off * 7))::date;
    v_period_end := v_period_start + 6;
    v_label := to_char(v_period_start, 'Mon DD') || ' – ' || to_char(v_period_end, 'Mon DD, YYYY');
  ELSIF p_period_type = 'month' THEN
    v_period_start := (date_trunc('month', (current_date AT TIME ZONE 'UTC'))::date - (v_off * interval '1 month'))::date;
    v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;
    v_label := to_char(v_period_start, 'Month YYYY');
  ELSIF p_period_type = 'year' THEN
    v_period_start := (date_trunc('year', (current_date AT TIME ZONE 'UTC'))::date - (v_off * interval '1 year'))::date;
    v_period_end := (v_period_start + interval '1 year' - interval '1 day')::date;
    v_label := to_char(v_period_start, 'YYYY');
  ELSE
    v_period_start := (date_trunc('week', (current_date AT TIME ZONE 'UTC'))::date - (v_off * 7))::date;
    v_period_end := v_period_start + 6;
    v_label := to_char(v_period_start, 'Mon DD') || ' – ' || to_char(v_period_end, 'Mon DD, YYYY');
  END IF;

  v_ts_start := (v_period_start::timestamp AT TIME ZONE 'UTC');
  v_ts_end := (v_period_end::timestamp + interval '1 day') AT TIME ZONE 'UTC';

  SELECT COUNT(*)::INTEGER INTO v_listen_count
  FROM logs l
  WHERE l.user_id = p_user_id
    AND l.listened_at >= v_ts_start
    AND l.listened_at < v_ts_end;

  SELECT s.artist_id INTO v_top_artist_id
  FROM logs l
  INNER JOIN tracks s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at >= v_ts_start
    AND l.listened_at < v_ts_end
  GROUP BY s.artist_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT s.album_id INTO v_top_album_id
  FROM logs l
  INNER JOIN tracks s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at >= v_ts_start
    AND l.listened_at < v_ts_end
  GROUP BY s.album_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT l.track_id INTO v_top_track_id
  FROM logs l
  WHERE l.user_id = p_user_id
    AND l.listened_at >= v_ts_start
    AND l.listened_at < v_ts_end
  GROUP BY l.track_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  period_start := v_period_start;
  period_end := v_period_end;
  period_label := v_label;
  listen_count := v_listen_count;
  top_artist_id := v_top_artist_id;
  top_album_id := v_top_album_id;
  top_track_id := v_top_track_id;
  RETURN NEXT;
  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- Discovery: trending MV + RPCs (093 window); rising / hidden gems (021, tracks)
-- ---------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_trending_entities AS
SELECT
  l.track_id AS entity_id,
  'song'::TEXT AS entity_type,
  COUNT(*)::BIGINT AS listen_count
FROM logs l
WHERE l.listened_at >= NOW() - INTERVAL '7 days'
GROUP BY l.track_id
HAVING COUNT(*) >= 2
ORDER BY listen_count DESC
LIMIT 50;

CREATE UNIQUE INDEX idx_mv_trending_entity_id ON mv_trending_entities (entity_id);

COMMENT ON MATERIALIZED VIEW mv_trending_entities IS
  'Top songs by log count in last 7 days (min 2 listens). Refreshed by refresh_discover_mvs().';

CREATE MATERIALIZED VIEW mv_rising_artists AS
WITH window_days AS (SELECT 7 AS d),
current_window AS (
  SELECT s.artist_id, COUNT(*)::BIGINT AS c
  FROM logs l
  INNER JOIN tracks s ON l.track_id = s.id
  CROSS JOIN window_days w
  WHERE l.listened_at >= NOW() - (w.d || ' days')::INTERVAL
  GROUP BY s.artist_id
),
previous_window AS (
  SELECT s.artist_id, COUNT(*)::BIGINT AS c
  FROM logs l
  INNER JOIN tracks s ON l.track_id = s.id
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

CREATE UNIQUE INDEX idx_mv_rising_artists_artist_id ON mv_rising_artists (artist_id);

CREATE MATERIALIZED VIEW mv_hidden_gems AS
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
        (SELECT COUNT(*)::BIGINT FROM logs l INNER JOIN tracks s ON l.track_id = s.id WHERE s.album_id = rs.entity_id)
      END
    ) AS listen_count
  FROM review_stats rs
)
SELECT entity_id, entity_type, avg_rating, listen_count
FROM listen_counts
WHERE listen_count <= 50
ORDER BY avg_rating DESC, listen_count ASC
LIMIT 50;

CREATE UNIQUE INDEX idx_mv_hidden_gems_entity ON mv_hidden_gems (entity_id, entity_type);

CREATE OR REPLACE FUNCTION refresh_discover_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_trending_entities;
  REFRESH MATERIALIZED VIEW mv_rising_artists;
  REFRESH MATERIALIZED VIEW mv_hidden_gems;
END;
$$;

CREATE OR REPLACE FUNCTION get_trending_entities_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.entity_id::text, m.entity_type, m.listen_count
  FROM mv_trending_entities m
  ORDER BY m.listen_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION get_rising_artists_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (artist_id TEXT, name TEXT, avatar_url TEXT, growth BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.artist_id::text, m.name, m.avatar_url, m.growth
  FROM mv_rising_artists m
  ORDER BY m.growth DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION get_hidden_gems_from_mv(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, avg_rating NUMERIC, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT m.entity_id::text, m.entity_type, m.avg_rating, m.listen_count
  FROM mv_hidden_gems m
  ORDER BY m.avg_rating DESC, m.listen_count ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION get_trending_entities(p_limit INT DEFAULT 20)
RETURNS TABLE (entity_id TEXT, entity_type TEXT, listen_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    l.track_id::text AS entity_id,
    'song'::TEXT AS entity_type,
    COUNT(*)::BIGINT AS listen_count
  FROM logs l
  WHERE l.listened_at >= NOW() - INTERVAL '7 days'
  GROUP BY l.track_id
  HAVING COUNT(*) >= 2
  ORDER BY listen_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

CREATE OR REPLACE FUNCTION get_rising_artists(p_limit INT DEFAULT 20, p_window_days INT DEFAULT 7)
RETURNS TABLE (artist_id TEXT, name TEXT, avatar_url TEXT, growth BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH window_days AS (SELECT LEAST(GREATEST(COALESCE(p_window_days, 7), 1), 90) AS d),
  current_window AS (
    SELECT s.artist_id, COUNT(*)::BIGINT AS c
    FROM logs l
    INNER JOIN tracks s ON l.track_id = s.id
    CROSS JOIN window_days w
    WHERE l.listened_at >= NOW() - (w.d || ' days')::INTERVAL
    GROUP BY s.artist_id
  ),
  previous_window AS (
    SELECT s.artist_id, COUNT(*)::BIGINT AS c
    FROM logs l
    INNER JOIN tracks s ON l.track_id = s.id
    CROSS JOIN window_days w
    WHERE l.listened_at >= NOW() - (2 * w.d || ' days')::INTERVAL
      AND l.listened_at < NOW() - (w.d || ' days')::INTERVAL
    GROUP BY s.artist_id
  )
  SELECT
    a.id::text AS artist_id,
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
          (SELECT COUNT(*)::BIGINT FROM logs l INNER JOIN tracks s ON l.track_id = s.id WHERE s.album_id = rs.entity_id)
        END
      ) AS listen_count
    FROM review_stats rs
  )
  SELECT entity_id::text, entity_type, avg_rating, listen_count
  FROM listen_counts
  WHERE listen_count <= LEAST(GREATEST(COALESCE(p_max_listens, 50), 0), 10000)
  ORDER BY avg_rating DESC, listen_count ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Community consensus + hidden gem candidates (084 / 085)
-- ---------------------------------------------------------------------------
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
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 101))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

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
    INNER JOIN tracks s ON s.id = l.track_id
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

-- ---------------------------------------------------------------------------
-- Feed listen sessions (056 / 074)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_feed_listen_sessions(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  type TEXT,
  user_id UUID,
  track_id TEXT,
  album_id TEXT,
  track_name TEXT,
  artist_name TEXT,
  song_count BIGINT,
  first_listened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      l.user_id,
      l.track_id,
      l.listened_at,
      COALESCE(l.album_id, s.album_id) AS resolved_album_id,
      COALESCE(s.name, 'Unknown') AS song_name,
      COALESCE(ar_song.name, ar_album.name, 'Unknown') AS artist_display
    FROM logs l
    INNER JOIN follows f ON f.following_id = l.user_id AND f.follower_id = p_follower_id
    LEFT JOIN tracks s ON s.id = l.track_id
    LEFT JOIN albums al ON al.id = COALESCE(l.album_id, s.album_id)
    LEFT JOIN artists ar_song ON ar_song.id = COALESCE(l.artist_id, s.artist_id)
    LEFT JOIN artists ar_album ON ar_album.id = al.artist_id
    WHERE COALESCE(l.album_id, s.album_id) IS NOT NULL
      AND l.listened_at >= (now() - interval '7 days')
      AND (p_cursor IS NULL OR l.listened_at < p_cursor)
  ),
  bucket_30 AS (
    SELECT
      b.user_id,
      b.track_id,
      b.resolved_album_id AS album_id,
      b.song_name AS track_name,
      b.artist_display AS artist_name,
      (date_trunc('hour', b.listened_at) + (floor(EXTRACT(MINUTE FROM b.listened_at) / 30)::int * 30) * interval '1 minute') AS session_bucket,
      b.listened_at
    FROM base b
  ),
  sessions AS (
    SELECT
      user_id,
      track_id,
      MAX(album_id::text)::uuid AS album_id,
      MAX(track_name) AS track_name,
      MAX(artist_name) AS artist_name,
      session_bucket,
      COUNT(*)::BIGINT AS song_count,
      MIN(listened_at) AS first_listened_at,
      MAX(listened_at) AS created_at
    FROM bucket_30
    GROUP BY user_id, track_id, session_bucket
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.user_id, date_trunc('hour', s.created_at)
        ORDER BY s.created_at DESC
      ) AS rn
    FROM sessions s
  )
  SELECT
    'listen_session'::TEXT AS type,
    r.user_id,
    r.track_id::text,
    r.album_id::text,
    r.track_name,
    r.artist_name,
    r.song_count,
    r.first_listened_at,
    r.created_at
  FROM ranked r
  WHERE r.rn <= 3
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION get_community_listen_sessions(
  p_community_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  type TEXT,
  user_id UUID,
  track_id TEXT,
  album_id TEXT,
  track_name TEXT,
  artist_name TEXT,
  song_count BIGINT,
  first_listened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT
      l.user_id,
      l.track_id,
      l.listened_at,
      COALESCE(l.album_id, s.album_id) AS resolved_album_id,
      COALESCE(s.name, 'Unknown') AS song_name,
      COALESCE(ar_song.name, ar_album.name, 'Unknown') AS artist_display
    FROM logs l
    INNER JOIN community_members cm
      ON cm.community_id = p_community_id
      AND cm.user_id = l.user_id
    LEFT JOIN tracks s ON s.id = l.track_id
    LEFT JOIN albums al ON al.id = COALESCE(l.album_id, s.album_id)
    LEFT JOIN artists ar_song ON ar_song.id = COALESCE(l.artist_id, s.artist_id)
    LEFT JOIN artists ar_album ON ar_album.id = al.artist_id
    WHERE COALESCE(l.album_id, s.album_id) IS NOT NULL
      AND l.listened_at >= (now() - interval '7 days')
      AND (p_cursor IS NULL OR l.listened_at < p_cursor)
  ),
  bucket_30 AS (
    SELECT
      b.user_id,
      b.track_id,
      b.resolved_album_id AS album_id,
      b.song_name AS track_name,
      b.artist_display AS artist_name,
      (date_trunc('hour', b.listened_at) + (floor(EXTRACT(MINUTE FROM b.listened_at) / 30)::int * 30) * interval '1 minute') AS session_bucket,
      b.listened_at
    FROM base b
  ),
  sessions AS (
    SELECT
      user_id,
      track_id,
      MAX(album_id::text)::uuid AS album_id,
      MAX(track_name) AS track_name,
      MAX(artist_name) AS artist_name,
      session_bucket,
      COUNT(*)::BIGINT AS song_count,
      MIN(listened_at) AS first_listened_at,
      MAX(listened_at) AS created_at
    FROM bucket_30
    GROUP BY user_id, track_id, session_bucket
  ),
  ranked AS (
    SELECT
      s.*,
      ROW_NUMBER() OVER (
        PARTITION BY s.user_id, date_trunc('hour', s.created_at)
        ORDER BY s.created_at DESC
      ) AS rn
    FROM sessions s
  )
  SELECT
    'listen_session'::TEXT AS type,
    r.user_id,
    r.track_id::text,
    r.album_id::text,
    r.track_name,
    r.artist_name,
    r.song_count,
    r.first_listened_at,
    r.created_at
  FROM ranked r
  WHERE r.rn <= 3
  ORDER BY r.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- Last.fm aggregate repair: legacy lfm:* track ids no longer exist; disable scan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_logs_for_lfm_aggregate_repair(p_limit INT DEFAULT 500)
RETURNS SETOF logs
LANGUAGE sql
STABLE
AS $$
  SELECT l.*
  FROM logs l
  WHERE FALSE
  LIMIT 0;
$$;
