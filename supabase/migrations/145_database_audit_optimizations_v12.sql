-- Optimization: Composite indexes for frequent activity feed and aggregation patterns.

-- Logs: Optimize friends' activity lookups (getFriendsAlbumActivity)
-- (track_id, user_id, listened_at DESC) already exists in 091.

-- Reviews: Optimize entity-specific review lookups with user context (getReviewsForEntity)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_user_created
ON reviews (entity_type, entity_id, user_id, created_at DESC);

-- Follows: Optimize feed lookups (loadFollowingIds)
-- (follower_id, following_id) already exists in 129.

-- Feed Events: Optimize user-specific story filtering (fetchFeedStoriesForFollower)
CREATE INDEX IF NOT EXISTS idx_feed_events_user_type_created
ON feed_events (user_id, type, created_at DESC);

-- Users: Optimize private logs check (getListenLogsInternal)
CREATE INDEX IF NOT EXISTS idx_users_logs_private
ON users (id) WHERE logs_private = true;

-- List Items: Optimize preview label retrieval (getUserListsWithPreviews)
CREATE INDEX IF NOT EXISTS idx_list_items_list_entity_pos
ON list_items (list_id, entity_type, entity_id, position);
