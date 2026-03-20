-- 049_query_audit_optimizations_v2.sql
-- Recommended indexes from query audit to improve performance of common access patterns.

-- Albums: Optimize leaderboard filtering by release date
CREATE INDEX IF NOT EXISTS idx_albums_release_date ON albums(release_date);

-- Entity Stats: Optimize leaderboard sorting by favorite count and play count
CREATE INDEX IF NOT EXISTS idx_entity_stats_favorite_count ON entity_stats(entity_type, favorite_count DESC);
CREATE INDEX IF NOT EXISTS idx_entity_stats_play_count ON entity_stats(entity_type, play_count DESC);

-- Reviews: Optimize entity page social queries (getReviewsForEntity)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_created_at ON reviews(entity_type, entity_id, created_at DESC);

-- Reviews: Optimize discovery queries (computeCooccurrence) filtering by type and time
CREATE INDEX IF NOT EXISTS idx_reviews_type_created_at ON reviews(entity_type, created_at DESC);

-- Logs: Optimize track and album activity queries (getListenLogsForTrack, getListenLogsForAlbum)
CREATE INDEX IF NOT EXISTS idx_logs_track_listened_at ON logs(track_id, listened_at DESC);
