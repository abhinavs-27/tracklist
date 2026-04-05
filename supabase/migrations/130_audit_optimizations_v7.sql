-- Migration 130: Audit optimizations v7
-- These indexes support high-frequency query patterns identified in the comprehensive database audit.

-- Logs: Optimize "recent listens for a specific user" with track context.
CREATE INDEX IF NOT EXISTS idx_logs_user_track_listened_at ON logs(user_id, track_id, listened_at DESC);

-- Reviews: Optimize fetching all reviews for a specific user with ordering.
-- Already partially covered by idx_reviews_user_id_created_at (migration 129),
-- ensuring redundancy check here is documented.

-- Feed Events: Optimize fetching stories for multiple users concurrently (feed merge).
-- Complementary to idx_feed_events_user_type_created (migration 125).
CREATE INDEX IF NOT EXISTS idx_feed_events_created_at_user_id ON feed_events(created_at DESC, user_id);

-- Follows: Optimize reciprocity checks and "followers of followers" lookups.
CREATE INDEX IF NOT EXISTS idx_follows_following_follower ON follows(following_id, follower_id);

-- Catalog: Optimize track lookups by album with position ordering (album pages).
CREATE INDEX IF NOT EXISTS idx_tracks_album_id_id ON tracks(album_id, id);

-- Notifications: Optimize count of unread for a user.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read = false;
