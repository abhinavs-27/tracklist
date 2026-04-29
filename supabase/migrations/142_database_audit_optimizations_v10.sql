-- 142_database_audit_optimizations_v10.sql
-- Optimizations for likes, comments, and reviews based on audit.

-- Comments performance for large threads/profile history
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
-- Ensure review/log indexes cover order
CREATE INDEX IF NOT EXISTS idx_comments_review_created ON public.comments(review_id, created_at ASC);
-- Legacy support for log_id comments (migration 012 fallback path)
CREATE INDEX IF NOT EXISTS idx_comments_log_id ON public.comments(log_id) WHERE log_id IS NOT NULL;

-- Likes performance for user profile/activity
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);

-- Review discovery/leaderboard optimizations
-- Reordered for leading-column match on (entity_type, entity_id) filters
CREATE INDEX IF NOT EXISTS idx_reviews_entity_rating ON public.reviews(entity_type, entity_id, rating);

-- Track stats ordering for global popular charts (fallback path)
CREATE INDEX IF NOT EXISTS idx_track_stats_listen_count_desc ON public.track_stats(listen_count DESC);
