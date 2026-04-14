-- Recommended composite indexes from database audit June 2024

CREATE INDEX IF NOT EXISTS user_achievements_user_id_earned_at_idx ON user_achievements(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS user_favorite_albums_user_id_position_idx ON user_favorite_albums(user_id, position);
CREATE INDEX IF NOT EXISTS logs_user_id_listened_at_idx ON logs(user_id, listened_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx ON notifications(user_id, created_at DESC);
