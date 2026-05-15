-- Database Audit Optimizations v11
-- Identifying missing indexes for high-traffic or large-dataset queries.

-- Optimized for fetching threads a user is a participant in, ordered by activity.
CREATE INDEX IF NOT EXISTS idx_social_thread_participants_user_id
  ON social_thread_participants (user_id);

-- Optimized for listing threads by kind for a specific user.
-- This supports kindFilter in listThreadsForUser.
CREATE INDEX IF NOT EXISTS idx_social_threads_kind_last_activity
  ON social_threads (kind, last_activity_at DESC);

-- Optimized for fetching replies in a thread.
CREATE INDEX IF NOT EXISTS idx_social_thread_replies_thread_id_created_at
  ON social_thread_replies (thread_id, created_at ASC);

-- Optimized for chronologically ordered comments on reviews (Express backend path).
CREATE INDEX IF NOT EXISTS idx_comments_review_id_created_at
  ON comments (review_id, created_at ASC);

-- Optimized for chronologically ordered comments on logs (legacy/fallback path).
CREATE INDEX IF NOT EXISTS idx_comments_log_id_created_at
  ON comments (log_id, created_at ASC)
  WHERE log_id IS NOT NULL;

-- Optimized for album ranking cache lookups.
CREATE INDEX IF NOT EXISTS idx_community_rankings_cache_community_range
  ON community_rankings_cache (community_id, range, entity_type);
