-- Migration 142: Database Audit Optimizations v10
-- This migration adds composite indexes identified during the database query audit.

-- Support for user achievement lookups and ordering in lib/queries.ts
-- (user_id, earned_at DESC)
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id_earned_at ON user_achievements(user_id, earned_at DESC);

-- Support for user favorite albums position ordering
-- (user_id, position)
-- Note: idx_user_favorite_albums_user_pos and idx_user_favorite_albums_user_position might exist from previous migrations,
-- but we ensure a consistent one here if they were missed in some environments.
CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_user_id_position ON user_favorite_albums(user_id, position);

-- Support for fetching user logs with ordering by listened_at
-- (user_id, listened_at DESC)
-- This is already partially covered by idx_logs_user_listened_at but ensures DESC optimization.
CREATE INDEX IF NOT EXISTS idx_logs_user_id_listened_at_desc ON logs(user_id, listened_at DESC);

-- Support for notification listing and unread count
-- (user_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at_desc ON notifications(user_id, created_at DESC);
