-- Migration 150: Database Audit Optimizations v10
-- This migration adds indexes to support optimized query patterns identified during the query audit.

-- Support for optimized comment retrieval and sorting in backend/routes/comments.ts
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_review_id_created_at ON comments(review_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_log_id ON comments(log_id) WHERE log_id IS NOT NULL;

-- Support for common "viewer has liked" checks in backend/routes/likes.ts and Next.js queries
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- Support for rating aggregation and filtered review lookups
CREATE INDEX IF NOT EXISTS idx_reviews_entity_type_id_rating ON reviews(entity_type, entity_id, rating);

-- Support for track stats sorting (redundant but explicit for chart performance)
CREATE INDEX IF NOT EXISTS idx_track_stats_listen_count_desc ON track_stats(listen_count DESC);
