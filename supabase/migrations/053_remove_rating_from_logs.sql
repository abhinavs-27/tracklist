-- Run after 052_logs_mobile_fields: remove quick-log ratings from `logs`.
-- Reviews still store ratings on `reviews`.

ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_rating_range;

ALTER TABLE logs
DROP COLUMN IF EXISTS rating;

-- Optional rollback:
-- ALTER TABLE logs ADD COLUMN rating INTEGER NULL;
