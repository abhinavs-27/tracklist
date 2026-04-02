-- Community Weekly Billboard: same shape as user_weekly_charts, aggregated across all members’ listens.

CREATE TABLE IF NOT EXISTS public.community_weekly_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  week_start TIMESTAMPTZ NOT NULL,
  week_end TIMESTAMPTZ NOT NULL,
  chart_type public.weekly_chart_type NOT NULL,
  rankings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_community_weekly_charts_community_week_type UNIQUE (community_id, week_start, chart_type)
);

CREATE INDEX IF NOT EXISTS idx_community_weekly_charts_community_week_type
  ON public.community_weekly_charts (community_id, week_start DESC, chart_type);

COMMENT ON TABLE public.community_weekly_charts IS
  'Weekly Billboard for a community: top 10 by total member plays from logs; week_end exclusive (next Sunday 00:00 UTC).';

ALTER TABLE public.community_weekly_charts DISABLE ROW LEVEL SECURITY;
