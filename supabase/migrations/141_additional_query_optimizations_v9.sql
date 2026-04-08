-- Migration 141: Additional Query Optimizations v9
-- This migration adds composite indexes to support optimized query patterns in lib/queries.ts and backend services.

-- Support for getReviewsForEntity in lib/queries.ts and reviewsService.ts
-- (entity_type, entity_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_type_id_created_at ON reviews(entity_type, entity_id, created_at DESC);

-- Support for getListenLogsInternal in lib/queries.ts and activityFeedService.ts
-- (track_id, listened_at DESC)
CREATE INDEX IF NOT EXISTS idx_logs_track_id_listened_at ON logs(track_id, listened_at DESC);

-- Support for searchUsers in userSearchService.ts and searchUsers in lib/queries.ts
-- ilike 'username' and order by username
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username gin_trgm_ops);

-- Support for listUsersByCreatedAt in lib/queries.ts
CREATE INDEX IF NOT EXISTS idx_users_created_at_id ON users(created_at, id);

-- Support for getFollowers/getFollowing in lib/queries.ts and followNetworkService.ts
CREATE INDEX IF NOT EXISTS idx_follows_following_id_created_at ON follows(following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id_created_at ON follows(follower_id, created_at DESC);

-- Support for leaderboard queries in leaderboardService.ts and lib/queries.ts
CREATE INDEX IF NOT EXISTS idx_albums_release_date_id ON albums(release_date DESC, id);
CREATE INDEX IF NOT EXISTS idx_track_stats_listen_count_desc ON track_stats(listen_count DESC);
CREATE INDEX IF NOT EXISTS idx_album_stats_listen_count_desc ON album_stats(listen_count DESC);

-- Support for community membership checks in RPCs
CREATE INDEX IF NOT EXISTS idx_community_members_user_id_community_id ON community_members(user_id, community_id);
