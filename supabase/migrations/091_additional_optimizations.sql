-- Migration 091: Additional query optimizations and recommended indexes
-- These indexes support common query patterns identified in the database audit.

-- Logs: Optimize "friends who listened to this track" and per-user track activity.
CREATE INDEX IF NOT EXISTS idx_logs_track_user_listened_at ON logs(track_id, user_id, listened_at DESC);

-- Songs: Optimize fetching all songs in an album (common in aggregation).
CREATE INDEX IF NOT EXISTS idx_songs_album_id ON songs(album_id);

-- Songs: Optimize fetching all songs by an artist (common in artist-scoped queries).
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);

-- Albums: Optimize fetching all albums by an artist.
CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums(artist_id);

-- Reviews: Optimize fetching latest reviews for an entity when type is already filtered.
CREATE INDEX IF NOT EXISTS idx_reviews_entity_id_created_at ON reviews(entity_id, created_at DESC);
