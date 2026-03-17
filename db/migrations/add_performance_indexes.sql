-- add_performance_indexes.sql
-- Additional performance indexes for key query paths in Tracklist.
-- NOTE: Column names have been adapted to the current schema
-- (logs has track_id/listened_at, reviews uses entity_type/entity_id, etc.).

-- Logs table indexes
CREATE INDEX IF NOT EXISTS idx_logs_user_id
ON logs(user_id);

-- created_at is used in older queries; listened_at has its own index already.
CREATE INDEX IF NOT EXISTS idx_logs_created_at
ON logs(created_at DESC);

-- Reviews table indexes
CREATE INDEX IF NOT EXISTS idx_reviews_user_id
ON reviews(user_id);

-- Support album/song lookups via entity_type + entity_id instead of album_id.
CREATE INDEX IF NOT EXISTS idx_reviews_entity_created_at
ON reviews(entity_type, entity_id, created_at DESC);

-- Follows table indexes (aliases of existing ones, guarded by IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_follows_follower
ON follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_followed
ON follows(following_id);

-- Favorites table indexes
-- The legacy favorites table was dropped; we now use user_favorite_albums.
CREATE INDEX IF NOT EXISTS idx_favorites_user
ON user_favorite_albums(user_id);

CREATE INDEX IF NOT EXISTS idx_favorites_album
ON user_favorite_albums(album_id);

-- Entity stats indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_stats_primary
ON entity_stats(entity_type, entity_id);

-- Search support indexes
CREATE INDEX IF NOT EXISTS idx_users_username_plain
ON users(username);

CREATE INDEX IF NOT EXISTS idx_albums_name
ON albums(name);

