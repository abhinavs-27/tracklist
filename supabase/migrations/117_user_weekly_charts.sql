-- Weekly Billboard: precomputed top-10 tracks/artists/albums per user per ISO week (UTC).

CREATE TYPE public.weekly_chart_type AS ENUM ('tracks', 'artists', 'albums');

CREATE TABLE IF NOT EXISTS public.user_weekly_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  chart_type public.weekly_chart_type NOT NULL,
  rankings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_weekly_charts_user_week_type UNIQUE (user_id, week_start, chart_type)
);

CREATE INDEX IF NOT EXISTS idx_user_weekly_charts_user_week_type
  ON public.user_weekly_charts (user_id, week_start DESC, chart_type);

COMMENT ON TABLE public.user_weekly_charts IS
  'Weekly Billboard: top 10 by raw play counts from logs; week_end is exclusive (next Monday 00:00 UTC).';

ALTER TABLE public.user_weekly_charts DISABLE ROW LEVEL SECURITY;

-- logs(user_id, listened_at) already indexed (see migration 100); no change required for chart scans.
