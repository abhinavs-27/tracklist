-- Threaded comments on feed targets within a community (separate from global `comments` on reviews).

CREATE TABLE IF NOT EXISTS feed_activity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id UUID NULL REFERENCES communities(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('review', 'log')),
  target_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_activity_comments_lookup
  ON feed_activity_comments(community_id, target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_activity_comments_global_log
  ON feed_activity_comments(target_type, target_id, created_at DESC)
  WHERE community_id IS NULL;

ALTER TABLE feed_activity_comments DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE feed_activity_comments IS 'Comments on feed targets: community_id set = community-only thread; NULL + log = home feed listen threads (reviews use `comments`).';
