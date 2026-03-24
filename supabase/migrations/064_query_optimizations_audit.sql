-- 064_query_optimizations_audit.sql
-- Missing indexes and RPCs identified during the database query audit.

-- Follows: Optimize follower/following lookups
CREATE INDEX IF NOT EXISTS idx_follows_following_follower_id ON follows(following_id, follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_following_id ON follows(follower_id, following_id);

-- List Items: Optimize position-based ordering and existence checks
CREATE INDEX IF NOT EXISTS idx_list_items_list_id_position ON list_items(list_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_list_items_list_id_entity_id ON list_items(list_id, entity_id);

-- User Favorite Albums: Optimize position-based ordering
CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_user_id_position ON user_favorite_albums(user_id, position ASC);

-- Notifications: Optimize read status filtering and time-based ordering
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read_created_at ON notifications(user_id, read, created_at DESC);

-- Songs: Optimize album and artist lookups with name ordering
CREATE INDEX IF NOT EXISTS idx_songs_album_id_name ON songs(album_id, name ASC);
CREATE INDEX IF NOT EXISTS idx_songs_artist_id_name ON songs(artist_id, name ASC);

-- Reviews: Optimize entity-level aggregation (deterministic order + limit)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_created_at_desc ON reviews(entity_type, entity_id, created_at DESC);

-- RPC: Efficiently fetch aggregated stats for multiple tracks
CREATE OR REPLACE FUNCTION get_track_stats_batch(p_track_ids TEXT[])
RETURNS TABLE (
  track_id TEXT,
  listen_count BIGINT,
  review_count BIGINT,
  avg_rating NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH l_counts AS (
    SELECT l.track_id, COUNT(*)::BIGINT as c
    FROM logs l
    WHERE l.track_id = ANY(p_track_ids)
    GROUP BY l.track_id
  ),
  r_stats AS (
    SELECT r.entity_id as track_id, COUNT(*)::BIGINT as c, AVG(r.rating)::NUMERIC as a
    FROM reviews r
    WHERE r.entity_type = 'song' AND r.entity_id = ANY(p_track_ids)
    GROUP BY r.entity_id
  )
  SELECT
    t.id as track_id,
    COALESCE(l.c, 0) as listen_count,
    COALESCE(r.c, 0) as review_count,
    ROUND(r.a, 1) as avg_rating
  FROM unnest(p_track_ids) t(id)
  LEFT JOIN l_counts l ON l.track_id = t.id
  LEFT JOIN r_stats r ON r.track_id = t.id;
END;
$$;
