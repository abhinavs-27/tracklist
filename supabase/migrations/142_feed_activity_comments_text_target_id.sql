-- Allow feed_activity_comments.target_id to be any string, not just UUID.
-- Compound feed-item IDs (e.g. "user_id-album_id-created_at") are valid targets.

ALTER TABLE feed_activity_comments
  ALTER COLUMN target_id TYPE TEXT;
