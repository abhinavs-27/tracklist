-- Audit optimizations v13
-- Focus on: user activity lookups and high-traffic query patterns.

-- Composite index for friends-who-listened to a specific track/album
-- Used by: getSongFriendLeaderboard, getAlbumFriendLeaderboard, getFriendsAlbumActivity
-- Query pattern: WHERE track_id IN (...) AND user_id IN (...)
CREATE INDEX IF NOT EXISTS idx_logs_track_user
  ON logs (track_id, user_id);

-- Optimized index for user profile review activity (Recent Activity)
-- Query: WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reviews_user_created_at_desc
  ON reviews (user_id, created_at DESC);
