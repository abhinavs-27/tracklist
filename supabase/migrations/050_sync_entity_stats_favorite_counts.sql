-- Most-favorited leaderboard reads entity_stats.favorite_count (see lib/queries getLeaderboard).
-- Favorite albums live in user_favorite_albums; nothing was aggregating them into entity_stats.
-- increment_entity_favorite_count exists but is never called from the app.
-- This RPC syncs counts from user_favorite_albums so cron (and on-demand calls) keep leaderboards accurate.

CREATE OR REPLACE FUNCTION sync_favorite_counts_from_user_favorite_albums()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert: global count = how many users picked this album as a favorite (up to 1 per user per slot).
  INSERT INTO entity_stats (entity_type, entity_id, play_count, review_count, avg_rating, favorite_count, updated_at)
  SELECT
    'album',
    album_id,
    0,
    0,
    NULL,
    COUNT(*)::int,
    NOW()
  FROM user_favorite_albums
  GROUP BY album_id
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET
    favorite_count = EXCLUDED.favorite_count,
    updated_at = NOW();

  -- Albums no longer favorited by anyone: clear stale favorite_count on album rows.
  UPDATE entity_stats es
  SET favorite_count = 0, updated_at = NOW()
  WHERE es.entity_type = 'album'
    AND es.favorite_count > 0
    AND NOT EXISTS (
      SELECT 1 FROM user_favorite_albums ufa WHERE ufa.album_id = es.entity_id
    );
END;
$$;

COMMENT ON FUNCTION sync_favorite_counts_from_user_favorite_albums() IS
  'Aggregates user_favorite_albums into entity_stats.favorite_count for album entities. Call from cron after refresh_entity_stats or after profile favorites change.';
