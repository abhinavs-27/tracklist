-- Precomputed album and track stats to avoid per-request aggregation.
-- Refreshed by cron calling refresh_entity_stats().

CREATE TABLE IF NOT EXISTS album_stats (
  album_id TEXT PRIMARY KEY,
  avg_rating NUMERIC(3,1),
  review_count INTEGER NOT NULL DEFAULT 0,
  listen_count INTEGER NOT NULL DEFAULT 0,
  rating_distribution JSONB NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS track_stats (
  track_id TEXT PRIMARY KEY,
  avg_rating NUMERIC(3,1),
  review_count INTEGER NOT NULL DEFAULT 0,
  listen_count INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_album_stats_last_updated ON album_stats(last_updated);
CREATE INDEX IF NOT EXISTS idx_track_stats_last_updated ON track_stats(last_updated);

ALTER TABLE album_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "album_stats_select_all" ON album_stats FOR SELECT USING (true);
CREATE POLICY "track_stats_select_all" ON track_stats FOR SELECT USING (true);

-- Service role / RPC will write via SECURITY DEFINER function below.

-- Precompute and upsert album_stats and track_stats from reviews + logs.
CREATE OR REPLACE FUNCTION refresh_entity_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Album stats: all albums that appear in songs or in reviews (entity_type=album)
  INSERT INTO album_stats (album_id, avg_rating, review_count, listen_count, rating_distribution, last_updated)
  SELECT
    a.album_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    COALESCE(r.rating_distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb),
    NOW()
  FROM (
    SELECT DISTINCT album_id FROM songs
    UNION
    SELECT DISTINCT entity_id FROM reviews WHERE entity_type = 'album'
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
    JOIN songs s ON s.id = l.track_id
    GROUP BY s.album_id
  ) l ON l.album_id = a.album_id
  ON CONFLICT (album_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    rating_distribution = EXCLUDED.rating_distribution,
    last_updated = NOW();

  -- Track stats: all tracks that appear in logs or in reviews (entity_type=song)
  INSERT INTO track_stats (track_id, avg_rating, review_count, listen_count, last_updated)
  SELECT
    t.track_id,
    r.avg_rating,
    COALESCE(r.review_count, 0)::int,
    COALESCE(l.listen_count, 0)::int,
    NOW()
  FROM (
    SELECT DISTINCT track_id FROM logs
    UNION
    SELECT DISTINCT entity_id FROM reviews WHERE entity_type = 'song'
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
    GROUP BY track_id
  ) l ON l.track_id = t.track_id
  ON CONFLICT (track_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    listen_count = EXCLUDED.listen_count,
    last_updated = NOW();
END;
$$;
