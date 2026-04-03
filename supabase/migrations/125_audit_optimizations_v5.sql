-- Audit-based optimizations v5
-- Optimized for viewer-member taste match lookups and roster sorting.

CREATE INDEX IF NOT EXISTS idx_community_taste_match_lookup
  ON community_taste_match(user_id, community_id, similarity_score DESC);

-- Optimized for feed_events fetching by user and type (e.g. stories).
CREATE INDEX IF NOT EXISTS idx_feed_events_user_type_created
  ON feed_events(user_id, type, created_at DESC);
