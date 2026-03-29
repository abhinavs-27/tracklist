-- 071_query_optimization_indexes_v3.sql
-- Optimized indexes for follows, logs, and reviews tables to improve performance of common access patterns.

-- Optimize following list and feed generation (filtering by follower_id)
CREATE INDEX IF NOT EXISTS idx_follows_follower_created_at ON follows(follower_id, created_at DESC);

-- Optimize follower list (filtering by following_id)
CREATE INDEX IF NOT EXISTS idx_follows_following_created_at ON follows(following_id, created_at DESC);

-- Optimize "friend activity" lookups (user_id and track_id combined with listened_at)
-- Note: idx_logs_track_user_listened_at already exists from migration 039.
-- This specific order (user_id, track_id, listened_at DESC) supports user-first filtering.
CREATE INDEX IF NOT EXISTS idx_logs_user_track_listened_at ON logs(user_id, track_id, listened_at DESC);

-- Double-checking composite indexes for user profiles (user_id, created_at DESC)
-- Note: idx_reviews_user_created_at already exists from migration 039.
