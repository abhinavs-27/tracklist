-- Database Audit Optimizations v10
-- Support for user activity history, optimized comment threads, and aggregation performance.

-- Optimized comment lookups by user (activity history)
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- Optimized ordered comment threads (avoiding full table scans for large reviews)
CREATE INDEX IF NOT EXISTS idx_comments_review_id_created_at ON comments(review_id, created_at ASC);

-- Legacy support for log-based comments
CREATE INDEX IF NOT EXISTS idx_comments_log_id ON comments(log_id) WHERE log_id IS NOT NULL;

-- Optimized like history by user
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- Optimized rating distribution and aggregation
-- Supports queries filtered by entity_type and entity_id that need to aggregate ratings
CREATE INDEX IF NOT EXISTS idx_reviews_entity_rating ON reviews(entity_type, entity_id, rating);

-- Support for global track charts
CREATE INDEX IF NOT EXISTS idx_track_stats_listen_count ON track_stats(listen_count DESC);
