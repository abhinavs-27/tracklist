-- 047_query_optimization_indexes.sql
-- Additional indexes to support optimized query patterns in lib/queries.ts

-- Reviews: Optimize user-level profile activity and feed (getReviewsForUser)
CREATE INDEX IF NOT EXISTS idx_reviews_user_created_at ON reviews(user_id, created_at DESC);

-- User Favorite Albums: Optimize ordered fetching (getUserFavoriteAlbums)
CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_user_pos ON user_favorite_albums(user_id, position);

-- Lists: Optimize user-level list fetching (getUserLists)
CREATE INDEX IF NOT EXISTS idx_lists_user_created_at ON lists(user_id, created_at DESC);
