-- Community feature layer: taste pairs, member stats, weekly identity, roles.
-- RLS off (consistent with other community tables; API enforces membership).

CREATE TABLE IF NOT EXISTS community_taste_match (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  similarity_score DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id <> member_id),
  PRIMARY KEY (community_id, user_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_community_taste_match_viewer
  ON community_taste_match(community_id, user_id);

CREATE TABLE IF NOT EXISTS community_member_stats (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listen_count_7d INTEGER NOT NULL DEFAULT 0,
  unique_artists_7d INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  max_streak_in_community INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_weekly_summary (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  top_genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_styles JSONB NOT NULL DEFAULT '[]'::jsonb,
  activity_pattern JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_community_weekly_summary_week
  ON community_weekly_summary(week_start DESC);

CREATE TABLE IF NOT EXISTS community_member_roles (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_type TEXT NOT NULL CHECK (role_type IN ('champion', 'on_fire', 'explorer')),
  week_start DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, role_type)
);

CREATE INDEX IF NOT EXISTS idx_community_member_roles_user
  ON community_member_roles(community_id, user_id);

ALTER TABLE community_events DROP CONSTRAINT IF EXISTS community_events_type_check;
ALTER TABLE community_events
  ADD CONSTRAINT community_events_type_check
  CHECK (type IN (
    'streak',
    'top_artist',
    'milestone',
    'listen',
    'review',
    'role_badge'
  ));

ALTER TABLE community_taste_match DISABLE ROW LEVEL SECURITY;
ALTER TABLE community_member_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE community_weekly_summary DISABLE ROW LEVEL SECURITY;
ALTER TABLE community_member_roles DISABLE ROW LEVEL SECURITY;

-- Optional: enable Realtime for live feed inserts (Supabase Dashboard → Database → Replication,
-- or SQL): ALTER PUBLICATION supabase_realtime ADD TABLE community_events;
