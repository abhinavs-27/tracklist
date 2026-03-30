-- Taste identity and listening insights: filter by user_id and order by listened_at (asc or desc).
-- Complements idx_logs_user_album_listened (user_id, album_id, listened_at) for scans without album_id.

CREATE INDEX IF NOT EXISTS idx_logs_user_listened_at ON logs(user_id, listened_at);
