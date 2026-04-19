-- Migration 142: Database Audit Optimizations v10
-- This migration adds composite indexes to support optimized query patterns identified during the database audit.

-- Support for myRowPromise in getReviewsForEntity (lib/queries.ts)
-- Optimized for checking if a specific user has reviewed an entity.
CREATE INDEX IF NOT EXISTS idx_reviews_entity_user ON reviews(entity_type, entity_id, user_id);

-- Support for getUserAchievements in lib/queries.ts
-- Optimized for fetching achievements for a user ordered by earned_at.
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_earned_at ON user_achievements(user_id, earned_at DESC);

-- Support for getUserFavoriteAlbums in lib/queries.ts
-- Optimized for fetching favorite albums in their specified order.
CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_user_pos ON user_favorite_albums(user_id, position);

-- Support for getListenLogsForUser in lib/queries.ts
-- Optimized for fetching a user's listen history ordered by listened_at.
CREATE INDEX IF NOT EXISTS idx_logs_user_id_listened_at ON logs(user_id, listened_at DESC);

-- Support for getNotifications in lib/queries.ts
-- Optimized for fetching a user's notifications ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC);
