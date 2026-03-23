-- Additional query optimizations: composite indexes to support refined access patterns.

-- Reviews: Optimize filtering by user AND entity type (profile pages / feed activity)
CREATE INDEX IF NOT EXISTS idx_reviews_user_entity_created ON reviews(user_id, entity_type, created_at DESC);

-- Logs: Optimize "album listening history" for a user (recent unique albums derivation)
CREATE INDEX IF NOT EXISTS idx_logs_user_album_listened ON logs(user_id, album_id, listened_at DESC);

-- Users: Optimize search by username
-- Migration 057 already added a trigram index on lists(title), but a simple B-tree on users(username) is good for standard ILIKE prefixes.
CREATE INDEX IF NOT EXISTS idx_users_username_prefix ON users(username text_pattern_ops);
