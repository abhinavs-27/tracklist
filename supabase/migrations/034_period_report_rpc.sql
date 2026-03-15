-- Period report: fixed week (Mon–Sun), month, or year with offset (0 = current, 1 = previous, ...).

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
  top_artist_id TEXT,
  top_album_id TEXT,
  top_track_id TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_label TEXT;
  v_listen_count INTEGER;
  v_top_artist_id TEXT;
  v_top_album_id TEXT;
  v_top_track_id TEXT;
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
  INNER JOIN songs s ON s.id = l.track_id
  WHERE l.user_id = p_user_id
    AND l.listened_at >= v_ts_start
    AND l.listened_at < v_ts_end
  GROUP BY s.artist_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT s.album_id INTO v_top_album_id
  FROM logs l
  INNER JOIN songs s ON s.id = l.track_id
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
