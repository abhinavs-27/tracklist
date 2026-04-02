-- Single RPC for community dashboard overview: chart top N, weekly summary rows,
-- light member leaderboard, and consensus preview (tracks, calendar month window).
-- Reduces multiple round-trips; consensus still uses existing get_community_consensus_rankings.

CREATE OR REPLACE FUNCTION public.get_community_overview(
  p_community_id UUID,
  p_consensus_limit INT DEFAULT 5,
  p_chart_top_n INT DEFAULT 10,
  p_member_light_limit INT DEFAULT 8
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start TIMESTAMPTZ;
  v_this_week DATE;
  v_prev_week DATE;
  v_chart JSONB;
  v_weekly JSONB;
  v_members JSONB;
  v_consensus JSONB;
  lim INT;
BEGIN
  v_month_start := make_timestamptz(
    EXTRACT(YEAR FROM timezone('utc', now()))::int,
    EXTRACT(MONTH FROM timezone('utc', now()))::int,
    1,
    0,
    0,
    0,
    'UTC'
  );
  v_this_week := (date_trunc('week', timezone('utc', now())))::date;
  v_prev_week := v_this_week - 7;
  lim := LEAST(10, GREATEST(1, COALESCE(p_consensus_limit, 5)));

  SELECT jsonb_build_object(
    'week_start', c.week_start::text,
    'week_end', c.week_end::text,
    'rankings', COALESCE(
      (
        SELECT jsonb_agg(e ORDER BY pos)
        FROM jsonb_array_elements(c.rankings) WITH ORDINALITY AS t(e, pos)
        WHERE pos <= LEAST(10, GREATEST(1, COALESCE(p_chart_top_n, 10)))
      ),
      '[]'::jsonb
    )
  )
  INTO v_chart
  FROM community_weekly_charts c
  WHERE c.community_id = p_community_id
    AND c.chart_type = 'tracks'::weekly_chart_type
  ORDER BY c.week_start DESC
  LIMIT 1;

  SELECT jsonb_build_object(
    'current', (
      SELECT to_jsonb(s)
      FROM community_weekly_summary s
      WHERE s.community_id = p_community_id
        AND s.week_start = v_this_week
    ),
    'previous', (
      SELECT to_jsonb(s)
      FROM community_weekly_summary s
      WHERE s.community_id = p_community_id
        AND s.week_start = v_prev_week
    )
  )
  INTO v_weekly;

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT
      u.id AS user_id,
      u.username,
      u.avatar_url,
      m.listen_count_7d,
      m.unique_artists_7d
    FROM community_member_stats m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.community_id = p_community_id
    ORDER BY m.listen_count_7d DESC NULLS LAST
    LIMIT LEAST(50, GREATEST(1, COALESCE(p_member_light_limit, 8)))
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.score DESC NULLS LAST), '[]'::jsonb)
  INTO v_consensus
  FROM get_community_consensus_rankings(
    p_community_id,
    'track',
    v_month_start,
    lim,
    0
  ) r;

  RETURN jsonb_build_object(
    'chart', v_chart,
    'weekly_summary', COALESCE(v_weekly, '{}'::jsonb),
    'member_stats_light', COALESCE(v_members, '[]'::jsonb),
    'consensus_preview', COALESCE(v_consensus, '[]'::jsonb),
    'meta', jsonb_build_object(
      'consensus_since', v_month_start::text,
      'weekly_week_start', v_this_week::text,
      'prev_week_start', v_prev_week::text
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_community_overview(UUID, INT, INT, INT) IS
  'Dashboard overview: latest tracks chart (top N), current/previous weekly summary rows, top members by 7d listens, consensus track preview for calendar month.';

REVOKE ALL ON FUNCTION public.get_community_overview(UUID, INT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_overview(UUID, INT, INT, INT) TO service_role;
