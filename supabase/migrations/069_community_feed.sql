-- Denormalized community activity feed (generic JSON payload per event_type).

CREATE TABLE IF NOT EXISTS community_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_feed_comm_created_id
  ON community_feed(community_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_feed_user ON community_feed(user_id);

ALTER TABLE community_feed DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE community_feed IS 'Community-scoped activity: listen, review, list_update, streak_role, member_joined, follow_in_community, etc.';
