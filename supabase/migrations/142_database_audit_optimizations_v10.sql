-- Migration 142: Database Audit Optimizations v10
-- Additional indexes to support high-traffic query patterns identified in May 2024 audit.

-- Reviews: Optimize entity reviews + "my review" lookup
CREATE INDEX IF NOT EXISTS idx_reviews_entity_context ON reviews(entity_type, entity_id, user_id, created_at DESC);

-- Logs: Optimize user profile history
CREATE INDEX IF NOT EXISTS idx_logs_user_listened_at_desc ON logs(user_id, listened_at DESC);

-- Tracks: Optimize artist discography and top tracks
CREATE INDEX IF NOT EXISTS idx_tracks_artist_album ON tracks(artist_id, album_id);

-- List Items: Optimize list membership checks and preview generation
CREATE INDEX IF NOT EXISTS idx_list_items_membership_preview ON list_items(list_id, entity_type, entity_id, position);

-- Users: Optimize privacy filtering (partial index)
CREATE INDEX IF NOT EXISTS idx_users_logs_private_true ON users(id) WHERE logs_private = true;
