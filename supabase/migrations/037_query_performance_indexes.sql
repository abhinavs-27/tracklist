-- Query performance: composite indexes for feed, album, track, and recommendation access patterns.
-- Apply after 015 (logs track_id/listened_at), 009 (songs album_id), 008 (reviews entity), 001 (follows), 020 (list_items).

-- logs: feed and album "recent listens" filter by user_id or track_id and order by listened_at
CREATE INDEX IF NOT EXISTS idx_logs_user_listened_at ON logs(user_id, listened_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_track_listened_at ON logs(track_id, listened_at DESC);

-- follows: "get following_id for follower_id" (covering) and is-following lookups
CREATE INDEX IF NOT EXISTS idx_follows_follower_following ON follows(follower_id, following_id);

-- songs(album_id) and reviews(entity_type, entity_id) and list_items(list_id, position) already exist
-- (009: idx_songs_album, 008: idx_reviews_entity, 020: idx_list_items_list_position).

-- Optional: composite for logs filtered by both user and track (e.g. getFriendsAlbumActivity)
-- Postgres can combine idx_logs_track_listened_at with user_id filter; add if EXPLAIN shows benefit:
-- CREATE INDEX IF NOT EXISTS idx_logs_track_user_listened_at ON logs(track_id, user_id, listened_at DESC);
