-- 014_review_indexes.sql
-- Performance indexes for the social data queries on entity pages.

CREATE INDEX IF NOT EXISTS idx_reviews_entity_id ON reviews(entity_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(entity_type, entity_id, rating);
CREATE INDEX IF NOT EXISTS idx_logs_song_id ON logs(spotify_song_id);
