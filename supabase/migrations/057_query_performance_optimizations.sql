-- 057_query_performance_optimizations.sql
-- Recommended indexes from query audit to improve performance of common access patterns.

-- logs: Optimize user-track specific lookups (e.g., getting specific song listen count for a user)
-- Useful for getFriendsAlbumActivity and other filtered aggregation queries.
CREATE INDEX IF NOT EXISTS idx_logs_user_id_track_id ON logs(user_id, track_id);

-- lists: Optimize public list search by title (ILIKE)
-- Enabling trigram index for faster title searching (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_lists_title_trgm ON lists USING gist (title gist_trgm_ops);
