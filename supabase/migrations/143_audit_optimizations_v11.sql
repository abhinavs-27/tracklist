-- Optimized for checking following status and retrieving friend activity by follower_id.
CREATE INDEX IF NOT EXISTS idx_follows_follower_id_following_id ON follows(follower_id, following_id);

-- Optimized for fetching feed events for multiple users ordered by creation date.
CREATE INDEX IF NOT EXISTS idx_feed_events_user_id_created_at ON feed_events(user_id, created_at DESC);

-- Optimized for fetching recent reviews for a specific user.
CREATE INDEX IF NOT EXISTS idx_reviews_user_id_created_at_v2 ON reviews(user_id, created_at DESC);

-- Optimized for filtering and fetching tracks by artist and album.
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id_album_id ON tracks(artist_id, album_id);

-- Optimized for counting logs for specific tracks and users.
CREATE INDEX IF NOT EXISTS idx_logs_track_id_user_id_listened_at ON logs(track_id, user_id, listened_at DESC);
