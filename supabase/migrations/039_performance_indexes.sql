-- Performance indexes for reviews, logs, and list items.
-- Reviews: getReviewsForUser (user_id, created_at)
CREATE INDEX IF NOT EXISTS idx_reviews_user_created_at ON reviews(user_id, created_at DESC);

-- Logs: getFriendsAlbumActivity (track_id, user_id, listened_at)
CREATE INDEX IF NOT EXISTS idx_logs_track_user_listened_at ON logs(track_id, user_id, listened_at DESC);

-- List Items: removeListItem or position updates (list_id)
-- Already covered by idx_list_items_list_position, but a dedicated list_id index can help some planners
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
