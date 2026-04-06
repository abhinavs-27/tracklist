-- Precomputed snapshots for fast API reads (refreshed by daily cron after stats + discover MVs).
-- Leaderboard: global, no year filter (same keys as API type + entity).
-- Trending: single global row of TrendingEntity[] JSON.
-- Community consensus: enriched rows per community / entity type / range (members-only via RLS).

CREATE TABLE IF NOT EXISTS public.leaderboard_cache (
  id TEXT PRIMARY KEY,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_count INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leaderboard_cache IS
  'Global leaderboard snapshot (no startYear/endYear). id = metric:entity e.g. popular:song.';

CREATE TABLE IF NOT EXISTS public.trending_cache (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trending_cache IS
  'Single-row snapshot of trending entities (last MV refresh; cron runs daily).';

CREATE TABLE IF NOT EXISTS public.community_rankings_cache (
  community_id UUID NOT NULL REFERENCES public.communities (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('track', 'album', 'artist')),
  range TEXT NOT NULL CHECK (range IN ('month', 'year')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, entity_type, range)
);

COMMENT ON TABLE public.community_rankings_cache IS
  'Consensus snapshot: payload = { "items": [...], "has_more": bool }. Refreshed daily for a capped set of communities.';

CREATE INDEX IF NOT EXISTS idx_community_rankings_cache_computed
  ON public.community_rankings_cache (computed_at DESC);

ALTER TABLE public.leaderboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_rankings_cache ENABLE ROW LEVEL SECURITY;

-- Public read: global leaderboards + trending (same as unauthenticated leaderboard/trending APIs).
CREATE POLICY leaderboard_cache_select_public ON public.leaderboard_cache
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY trending_cache_select_public ON public.trending_cache
  FOR SELECT TO anon, authenticated
  USING (true);

-- Consensus: members only (matches API gate).
CREATE POLICY community_rankings_select_members ON public.community_rankings_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_members m
      WHERE m.community_id = community_rankings_cache.community_id
        AND m.user_id = auth.uid()
    )
  );

-- Service role (cron) writes via admin client — bypasses RLS.

GRANT SELECT ON public.leaderboard_cache TO anon, authenticated;
GRANT SELECT ON public.trending_cache TO anon, authenticated;
GRANT SELECT ON public.community_rankings_cache TO authenticated;
