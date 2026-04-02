-- Server-side global leaderboards: correct ORDER BY + LIMIT/OFFSET over full stats tables
-- (avoids app-side caps like 2000/1000 rows and unstable ties on listen_count = 0).

CREATE INDEX IF NOT EXISTS idx_album_stats_listen_count_desc
  ON album_stats (listen_count DESC);

CREATE INDEX IF NOT EXISTS idx_album_stats_listen_count_positive
  ON album_stats (listen_count DESC)
  WHERE listen_count > 0;

CREATE INDEX IF NOT EXISTS idx_track_stats_listen_count_desc
  ON track_stats (listen_count DESC);

CREATE INDEX IF NOT EXISTS idx_track_stats_listen_count_positive
  ON track_stats (listen_count DESC)
  WHERE listen_count > 0;

-- p_metric: 'popular' | 'top_rated'
CREATE OR REPLACE FUNCTION public.get_leaderboard_albums(
  p_metric text,
  p_limit int,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  album_id uuid,
  listen_count int,
  avg_rating numeric,
  album_name text,
  artist_id uuid,
  artist_name text,
  image_url text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_metric = 'popular' THEN
    RETURN QUERY
    SELECT
      x.album_id,
      x.listen_count,
      x.avg_rating,
      x.album_name,
      x.artist_id,
      x.artist_name,
      x.image_url,
      x.total_count
    FROM (
      SELECT
        s.album_id,
        s.listen_count::int,
        s.avg_rating,
        a.name AS album_name,
        a.artist_id,
        ar.name AS artist_name,
        a.image_url,
        COUNT(*) OVER () AS total_count
      FROM album_stats s
      INNER JOIN albums a ON a.id = s.album_id
      INNER JOIN artists ar ON ar.id = a.artist_id
      WHERE s.listen_count > 0
    ) x
    ORDER BY x.listen_count DESC, x.album_id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  IF p_metric = 'top_rated' THEN
    RETURN QUERY
    SELECT
      x.album_id,
      x.listen_count,
      x.avg_rating,
      x.album_name,
      x.artist_id,
      x.artist_name,
      x.image_url,
      x.total_count
    FROM (
      SELECT
        s.album_id,
        s.listen_count::int,
        s.avg_rating,
        a.name AS album_name,
        a.artist_id,
        ar.name AS artist_name,
        a.image_url,
        COUNT(*) OVER () AS total_count
      FROM album_stats s
      INNER JOIN albums a ON a.id = s.album_id
      INNER JOIN artists ar ON ar.id = a.artist_id
      WHERE s.avg_rating IS NOT NULL
    ) x
    ORDER BY
      (x.avg_rating * log(10::numeric, GREATEST(1 + x.listen_count, 1)::numeric)) DESC NULLS LAST,
      x.album_id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  RAISE EXCEPTION 'get_leaderboard_albums: invalid p_metric %', p_metric;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_tracks(
  p_metric text,
  p_limit int,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  track_id uuid,
  listen_count int,
  avg_rating numeric,
  track_name text,
  artist_id uuid,
  artist_name text,
  image_url text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_metric = 'popular' THEN
    RETURN QUERY
    SELECT
      x.track_id,
      x.listen_count,
      x.avg_rating,
      x.track_name,
      x.artist_id,
      x.artist_name,
      x.image_url,
      x.total_count
    FROM (
      SELECT
        ts.track_id,
        ts.listen_count::int,
        ts.avg_rating,
        t.name AS track_name,
        t.artist_id,
        ar.name AS artist_name,
        al.image_url,
        COUNT(*) OVER () AS total_count
      FROM track_stats ts
      INNER JOIN tracks t ON t.id = ts.track_id
      INNER JOIN albums al ON al.id = t.album_id
      INNER JOIN artists ar ON ar.id = t.artist_id
      WHERE ts.listen_count > 0
    ) x
    ORDER BY x.listen_count DESC, x.track_id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  IF p_metric = 'top_rated' THEN
    RETURN QUERY
    SELECT
      x.track_id,
      x.listen_count,
      x.avg_rating,
      x.track_name,
      x.artist_id,
      x.artist_name,
      x.image_url,
      x.total_count
    FROM (
      SELECT
        ts.track_id,
        ts.listen_count::int,
        ts.avg_rating,
        t.name AS track_name,
        t.artist_id,
        ar.name AS artist_name,
        al.image_url,
        COUNT(*) OVER () AS total_count
      FROM track_stats ts
      INNER JOIN tracks t ON t.id = ts.track_id
      INNER JOIN albums al ON al.id = t.album_id
      INNER JOIN artists ar ON ar.id = t.artist_id
      WHERE ts.avg_rating IS NOT NULL
    ) x
    ORDER BY
      (x.avg_rating * log(10::numeric, GREATEST(1 + x.listen_count, 1)::numeric)) DESC NULLS LAST,
      x.track_id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  RAISE EXCEPTION 'get_leaderboard_tracks: invalid p_metric %', p_metric;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_albums(text, int, int) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_tracks(text, int, int) TO anon, authenticated, service_role;
