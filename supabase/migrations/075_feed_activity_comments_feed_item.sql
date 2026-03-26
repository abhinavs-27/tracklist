-- Allow comments on any feed row via stable string id (`feed_item`), not only UUID review/log targets.

ALTER TABLE feed_activity_comments
  ALTER COLUMN target_id TYPE TEXT USING target_id::text;

ALTER TABLE feed_activity_comments
  DROP CONSTRAINT IF EXISTS feed_activity_comments_target_type_check;

ALTER TABLE feed_activity_comments
  ADD CONSTRAINT feed_activity_comments_target_type_check
  CHECK (target_type IN ('review', 'log', 'feed_item'));

COMMENT ON COLUMN feed_activity_comments.target_id IS 'UUID for review/log; opaque feed row id (e.g. ls:…) for feed_item.';
