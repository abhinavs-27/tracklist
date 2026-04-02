-- Chart weeks use Sunday 00:00 UTC → next Sunday 00:00 UTC (week_end exclusive).

COMMENT ON TABLE public.user_weekly_charts IS
  'Weekly Billboard: top 10 by raw play counts from logs; week_start is Sunday 00:00 UTC; week_end is exclusive (next Sunday 00:00 UTC).';
