-- 049_audit_optimizations.sql
-- Recommended indexes from query audit to improve performance of common access patterns.

-- albums: Optimize leaderboard filtering by year/decade
CREATE INDEX IF NOT EXISTS idx_albums_release_date ON albums(release_date);

-- user_favorite_albums: Optimize "most favorited" leaderboard queries and user profile lookups
CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_album_id ON user_favorite_albums(album_id);
