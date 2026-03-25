-- Feed v2: precomputed story events (not raw logs).

CREATE TABLE IF NOT EXISTS feed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_feed_events_user_created
  ON feed_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_events_created
  ON feed_events(created_at DESC);

COMMENT ON TABLE feed_events IS 'Insight-style feed items (discovery, binge, rating, etc.); dedupe_key prevents spam.';
