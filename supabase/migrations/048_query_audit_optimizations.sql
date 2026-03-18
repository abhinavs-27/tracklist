-- 048_query_audit_optimizations.sql
-- Recommended indexes from query audit to improve performance of common access patterns.

-- spotify_recent_tracks: Optimize recent activity fetches for a user (recent albums/tracks)
CREATE INDEX IF NOT EXISTS idx_spotify_recent_tracks_user_played_at
  ON spotify_recent_tracks(user_id, played_at DESC);

-- logs: Optimize "friend activity" queries on specific tracks or albums
CREATE INDEX IF NOT EXISTS idx_logs_track_user_listened_at
  ON logs(track_id, user_id, listened_at DESC);

-- list_items: Optimize checking if an entity is already in a specific list
CREATE INDEX IF NOT EXISTS idx_list_items_list_entity
  ON list_items(list_id, entity_id);
