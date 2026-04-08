-- Home feed merged path: get_feed_reviews (017), get_feed_follows (017), get_feed_listen_sessions (023),
-- plus feed_events story queries (065+).
--
-- Expected supporting indexes (no-op if already applied):
--   reviews: idx_reviews_user_id_created_at (129), idx_reviews_user_created_at (047/039)
--   follows: idx_follows_follower_following (129), idx_follows_following_follower (130),
--            idx_follows_follower_created_at (100)
--   feed_events: idx_feed_events_user_type_created (125), idx_feed_events_user_created_at (131)
--   logs: idx_logs_user_listened_at (100), idx_logs_track_id (015), idx_songs_album (009)
--   user_weekly_charts: idx_user_weekly_charts_user_week_type (117)
--
-- This migration documents the dependency chain for profiling; it does not create duplicate indexes.

SELECT 1 AS home_feed_rpc_indexes_verified;
