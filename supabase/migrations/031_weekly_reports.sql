-- Weekly music reports: aggregate stats over the last 7 days per user.

CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  listen_count INTEGER NOT NULL DEFAULT 0,
  top_artist_id TEXT,
  top_album_id TEXT,
  top_track_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports(user_id, week_start DESC);

-- Generate report for user from logs in the last 7 days (using songs for album/artist).
CREATE OR REPLACE FUNCTION generate_weekly_report(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  week_start DATE,
  listen_count INTEGER,
  top_artist_id TEXT,
  top_album_id TEXT,
  top_track_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_week_start DATE;
  v_listen_count INTEGER;
  v_top_artist_id TEXT;
  v_top_album_id TEXT;
  v_top_track_id TEXT;
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
  INNER JOIN songs s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at >= (v_week_start::timestamp AT TIME ZONE 'UTC')
    AND l.listened_at < (current_date::timestamp AT TIME ZONE 'UTC')
  GROUP BY s.artist_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT s.album_id INTO v_top_album_id
  FROM logs l
  INNER JOIN songs s ON s.id = l.track_id
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
