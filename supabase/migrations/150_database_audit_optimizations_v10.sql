-- Migration 150: Database Audit Optimizations v10
-- This migration adds indexes to support optimized query patterns in lib/queries.ts, lib/feed/merged-feed.ts, and backend services.

-- Support for type-filtered feed queries in lib/feed/merged-feed.ts and activityFeedService.ts
CREATE INDEX IF NOT EXISTS idx_feed_events_user_type_created ON feed_events(user_id, type, created_at DESC);

-- Support for user profile activity feed in lib/queries.ts and profileActivity service
CREATE INDEX IF NOT EXISTS idx_reviews_user_id_created_at ON reviews(user_id, created_at DESC);

-- Optimized per-user log activity (e.g. recent logs for a user)
CREATE INDEX IF NOT EXISTS idx_logs_user_listened_at_desc ON logs(user_id, listened_at DESC);

-- Support for finding comments by a user (profile comments tab or cleanup)
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- Support for ordered comments on a review
CREATE INDEX IF NOT EXISTS idx_comments_review_created ON comments(review_id, created_at ASC);

-- Support for comments on a log (legacy fallback)
CREATE INDEX IF NOT EXISTS idx_comments_log_id ON comments(log_id) WHERE log_id IS NOT NULL;

-- Support for likes by a user (liked activity)
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- Support for entity-scoped reviews with rating (charts, popular reviews)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_type_id_rating ON reviews(entity_type, entity_id, rating);
