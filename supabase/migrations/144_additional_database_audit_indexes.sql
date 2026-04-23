-- Additional database optimizations based on June 2024 and March 2025 audits.

-- Optimized for finding lists containing a specific item (e.g., "Contained in X lists" on album/track pages).
CREATE INDEX IF NOT EXISTS list_items_entity_type_entity_id_idx ON list_items (entity_type, entity_id);

-- Optimized for profile filtering of reviews by type (e.g., viewing only album reviews for a user).
CREATE INDEX IF NOT EXISTS reviews_user_id_entity_type_created_at_idx ON reviews (user_id, entity_type, created_at DESC);

-- Optimized for "your history with this track" (frequently used in track/album detail pages).
CREATE INDEX IF NOT EXISTS logs_user_id_track_id_listened_at_idx ON logs (user_id, track_id, listened_at DESC);

-- Optimized for album favorited by users RPC and profile activity filters.
CREATE INDEX IF NOT EXISTS reviews_entity_type_entity_id_user_id_idx ON reviews (entity_type, entity_id, user_id);

-- Optimized for user achievement lookups ordered by time.
CREATE INDEX IF NOT EXISTS user_achievements_user_id_earned_at_idx ON user_achievements (user_id, earned_at DESC);
