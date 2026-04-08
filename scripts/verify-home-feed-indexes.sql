-- Run against a Supabase/Postgres instance (e.g. SQL editor or psql).
-- Lists expected indexes for home feed RPCs (see migration 139). Empty rows mean a gap to fix in prod.

SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_reviews_user_id_created_at',
    'idx_reviews_user_created_at',
    'idx_follows_follower_following',
    'idx_follows_following_follower',
    'idx_follows_follower_created_at',
    'idx_feed_events_user_type_created',
    'idx_feed_events_user_created_at',
    'idx_feed_events_created_at_user_id',
    'idx_logs_user_listened_at',
    'idx_logs_track_id',
    'idx_songs_album',
    'idx_songs_album_id',
    'idx_user_weekly_charts_user_week_type'
  )
ORDER BY indexname;

-- Expected supporting indexes may also exist under alternate names from older migrations;
-- see supabase/migrations/139_home_feed_rpc_index_verification.sql
