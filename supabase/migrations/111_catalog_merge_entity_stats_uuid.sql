-- 111: Fix entity_stats UUID comparisons in catalog merge pair RPCs.
-- Migration 101 set entity_stats.entity_id to UUID; merge helpers still used p_winner::text / p_loser::text,
-- causing "operator does not exist: uuid = text". Compare and assign UUIDs directly for entity_stats only.
-- user_listening_aggregates.entity_id and notifications.entity_id remain TEXT (UUID strings).
--
-- Apply after 110.

CREATE OR REPLACE FUNCTION public.merge_catalog_track_pair(p_winner uuid, p_loser uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  DELETE FROM track_external_ids te
  WHERE te.track_id = p_loser
    AND EXISTS (
      SELECT 1 FROM track_external_ids w
      WHERE w.track_id = p_winner
        AND w.source = te.source
        AND w.external_id = te.external_id
    );

  UPDATE track_external_ids SET track_id = p_winner WHERE track_id = p_loser;

  UPDATE logs SET track_id = p_winner WHERE track_id = p_loser;

  DELETE FROM logs l
  WHERE l.track_id = p_winner
    AND l.id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, track_id, listened_at ORDER BY id
          ) AS rn
        FROM logs
        WHERE track_id = p_winner
      ) x
      WHERE rn > 1
    );

  DELETE FROM reviews r
  WHERE r.entity_type = 'song'
    AND r.entity_id = p_loser
    AND EXISTS (
      SELECT 1 FROM reviews w
      WHERE w.entity_type = 'song'
        AND w.entity_id = p_winner
        AND w.user_id = r.user_id
    );

  UPDATE reviews SET entity_id = p_winner
  WHERE entity_type = 'song' AND entity_id = p_loser;

  DELETE FROM reviews r
  WHERE r.entity_type = 'song'
    AND r.entity_id = p_winner
    AND r.id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, entity_type, entity_id ORDER BY id
          ) AS rn
        FROM reviews
        WHERE entity_type = 'song' AND entity_id = p_winner
      ) x
      WHERE rn > 1
    );

  UPDATE list_items SET entity_id = p_winner
  WHERE entity_type = 'song' AND entity_id = p_loser;

  DELETE FROM list_items li
  WHERE li.entity_type = 'song'
    AND li.entity_id = p_winner
    AND li.id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY list_id, entity_type, entity_id ORDER BY id
          ) AS rn
        FROM list_items
        WHERE entity_type = 'song' AND entity_id = p_winner
      ) x
      WHERE rn > 1
    );

  UPDATE track_stats w
  SET
    listen_count = w.listen_count + COALESCE(l.listen_count, 0),
    review_count = w.review_count + COALESCE(l.review_count, 0),
    last_updated = now()
  FROM track_stats l
  WHERE l.track_id = p_loser AND w.track_id = p_winner;

  DELETE FROM track_stats WHERE track_id = p_loser;

  UPDATE track_stats SET track_id = p_winner WHERE track_id = p_loser;

  UPDATE entity_stats w
  SET
    play_count = w.play_count + COALESCE(l.play_count, 0),
    review_count = w.review_count + COALESCE(l.review_count, 0),
    favorite_count = w.favorite_count + COALESCE(l.favorite_count, 0),
    updated_at = now()
  FROM entity_stats l
  WHERE l.entity_type = 'song'
    AND l.entity_id = p_loser
    AND w.entity_type = 'song'
    AND w.entity_id = p_winner;

  DELETE FROM entity_stats WHERE entity_type = 'song' AND entity_id = p_loser;

  UPDATE entity_stats SET entity_id = p_winner
  WHERE entity_type = 'song' AND entity_id = p_loser;

  UPDATE user_listening_aggregates w
  SET
    count = w.count + l.count,
    updated_at = now()
  FROM user_listening_aggregates l
  WHERE l.entity_type = 'track'
    AND l.entity_id = p_loser::text
    AND w.entity_type = 'track'
    AND w.entity_id = p_winner::text
    AND w.user_id = l.user_id
    AND w.week_start IS NOT DISTINCT FROM l.week_start
    AND w.month IS NOT DISTINCT FROM l.month
    AND w.year IS NOT DISTINCT FROM l.year;

  DELETE FROM user_listening_aggregates
  WHERE entity_type = 'track' AND entity_id = p_loser::text;

  UPDATE user_listening_aggregates SET entity_id = p_winner::text
  WHERE entity_type = 'track' AND entity_id = p_loser::text;

  UPDATE notifications SET entity_id = p_winner::text
  WHERE entity_type = 'song' AND entity_id = p_loser::text;

  DELETE FROM spotify_recent_tracks srt_l
  WHERE srt_l.track_id = p_loser
    AND EXISTS (
      SELECT 1
      FROM spotify_recent_tracks srt_w
      WHERE srt_w.user_id = srt_l.user_id
        AND srt_w.track_id = p_winner
        AND srt_w.played_at = srt_l.played_at
    );

  UPDATE spotify_recent_tracks SET track_id = p_winner WHERE track_id = p_loser;

  UPDATE weekly_reports SET top_track_id = p_winner WHERE top_track_id = p_loser;

  PERFORM public.repoint_community_feed_track_merge(p_loser, p_winner);

  DELETE FROM tracks WHERE id = p_loser;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_catalog_album_pair(p_winner uuid, p_loser uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  DELETE FROM album_external_ids ae
  WHERE ae.album_id = p_loser
    AND EXISTS (
      SELECT 1 FROM album_external_ids w
      WHERE w.album_id = p_winner
        AND w.source = ae.source
        AND w.external_id = ae.external_id
    );

  UPDATE album_external_ids SET album_id = p_winner WHERE album_id = p_loser;

  UPDATE tracks SET album_id = p_winner WHERE album_id = p_loser;
  UPDATE logs SET album_id = p_winner WHERE album_id = p_loser;

  DELETE FROM reviews r
  WHERE r.entity_type = 'album'
    AND r.entity_id = p_loser
    AND EXISTS (
      SELECT 1 FROM reviews w
      WHERE w.entity_type = 'album'
        AND w.entity_id = p_winner
        AND w.user_id = r.user_id
    );

  UPDATE reviews SET entity_id = p_winner
  WHERE entity_type = 'album' AND entity_id = p_loser;

  DELETE FROM reviews r
  WHERE r.entity_type = 'album'
    AND r.entity_id = p_winner
    AND r.id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, entity_type, entity_id ORDER BY id
          ) AS rn
        FROM reviews
        WHERE entity_type = 'album' AND entity_id = p_winner
      ) x
      WHERE rn > 1
    );

  UPDATE list_items SET entity_id = p_winner
  WHERE entity_type = 'album' AND entity_id = p_loser;

  DELETE FROM list_items li
  WHERE li.entity_type = 'album'
    AND li.entity_id = p_winner
    AND li.id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY list_id, entity_type, entity_id ORDER BY id
          ) AS rn
        FROM list_items
        WHERE entity_type = 'album' AND entity_id = p_winner
      ) x
      WHERE rn > 1
    );

  UPDATE album_stats w
  SET
    listen_count = w.listen_count + COALESCE(l.listen_count, 0),
    review_count = w.review_count + COALESCE(l.review_count, 0),
    last_updated = now()
  FROM album_stats l
  WHERE l.album_id = p_loser AND w.album_id = p_winner;

  DELETE FROM album_stats WHERE album_id = p_loser;

  UPDATE album_stats SET album_id = p_winner WHERE album_id = p_loser;

  UPDATE entity_stats w
  SET
    play_count = w.play_count + COALESCE(l.play_count, 0),
    review_count = w.review_count + COALESCE(l.review_count, 0),
    favorite_count = w.favorite_count + COALESCE(l.favorite_count, 0),
    updated_at = now()
  FROM entity_stats l
  WHERE l.entity_type = 'album'
    AND l.entity_id = p_loser
    AND w.entity_type = 'album'
    AND w.entity_id = p_winner;

  DELETE FROM entity_stats WHERE entity_type = 'album' AND entity_id = p_loser;

  UPDATE entity_stats SET entity_id = p_winner
  WHERE entity_type = 'album' AND entity_id = p_loser;

  UPDATE user_listening_aggregates w
  SET
    count = w.count + l.count,
    updated_at = now()
  FROM user_listening_aggregates l
  WHERE l.entity_type = 'album'
    AND l.entity_id = p_loser::text
    AND w.entity_type = 'album'
    AND w.entity_id = p_winner::text
    AND w.user_id = l.user_id
    AND w.week_start IS NOT DISTINCT FROM l.week_start
    AND w.month IS NOT DISTINCT FROM l.month
    AND w.year IS NOT DISTINCT FROM l.year;

  DELETE FROM user_listening_aggregates
  WHERE entity_type = 'album' AND entity_id = p_loser::text;

  UPDATE user_listening_aggregates SET entity_id = p_winner::text
  WHERE entity_type = 'album' AND entity_id = p_loser::text;

  UPDATE notifications SET entity_id = p_winner::text
  WHERE entity_type = 'album' AND entity_id = p_loser::text;

  UPDATE weekly_reports SET top_album_id = p_winner WHERE top_album_id = p_loser;

  UPDATE spotify_recent_tracks SET album_id = p_winner WHERE album_id = p_loser;

  UPDATE user_top_albums w
  SET listen_count = w.listen_count + COALESCE(l.listen_count, 0)
  FROM user_top_albums l
  WHERE l.album_id = p_loser
    AND w.album_id = p_winner
    AND w.user_id = l.user_id
    AND w.period = l.period;

  DELETE FROM user_top_albums l
  WHERE l.album_id = p_loser
    AND EXISTS (
      SELECT 1 FROM user_top_albums w
      WHERE w.album_id = p_winner
        AND w.user_id = l.user_id
        AND w.period = l.period
    );

  UPDATE user_top_albums SET album_id = p_winner WHERE album_id = p_loser;

  UPDATE user_favorite_albums SET album_id = p_winner WHERE album_id = p_loser;

  DELETE FROM user_favorite_albums ufa1
  USING user_favorite_albums ufa2
  WHERE ufa1.user_id = ufa2.user_id
    AND ufa1.album_id = ufa2.album_id
    AND ufa1.position > ufa2.position;

  PERFORM public.repoint_community_feed_album_merge(p_loser, p_winner);

  DELETE FROM albums WHERE id = p_loser;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_catalog_artist_pair(p_winner uuid, p_loser uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  DELETE FROM artist_external_ids ae
  WHERE ae.artist_id = p_loser
    AND EXISTS (
      SELECT 1 FROM artist_external_ids w
      WHERE w.artist_id = p_winner
        AND w.source = ae.source
        AND w.external_id = ae.external_id
    );

  UPDATE artist_external_ids SET artist_id = p_winner WHERE artist_id = p_loser;

  UPDATE albums SET artist_id = p_winner WHERE artist_id = p_loser;
  UPDATE tracks SET artist_id = p_winner WHERE artist_id = p_loser;

  UPDATE logs SET artist_id = p_winner WHERE artist_id = p_loser;

  DELETE FROM reviews r
  WHERE r.entity_type = 'artist'
    AND r.entity_id = p_loser
    AND EXISTS (
      SELECT 1 FROM reviews w
      WHERE w.entity_type = 'artist'
        AND w.entity_id = p_winner
        AND w.user_id = r.user_id
    );

  UPDATE reviews SET entity_id = p_winner
  WHERE entity_type = 'artist' AND entity_id = p_loser;

  DELETE FROM reviews r
  WHERE r.entity_type = 'artist'
    AND r.entity_id = p_winner
    AND r.id IN (
      SELECT id FROM (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, entity_type, entity_id ORDER BY id
          ) AS rn
        FROM reviews
        WHERE entity_type = 'artist' AND entity_id = p_winner
      ) x
      WHERE rn > 1
    );

  DELETE FROM user_favorite_artists ufa_l
  WHERE ufa_l.artist_id = p_loser
    AND EXISTS (
      SELECT 1
      FROM user_favorite_artists ufa_w
      WHERE ufa_w.user_id = ufa_l.user_id
        AND ufa_w.artist_id = p_winner
    );

  UPDATE user_favorite_artists SET artist_id = p_winner WHERE artist_id = p_loser;

  DELETE FROM user_favorite_artists ufa1
  USING user_favorite_artists ufa2
  WHERE ufa1.user_id = ufa2.user_id
    AND ufa1.artist_id = ufa2.artist_id
    AND ufa1.position > ufa2.position;

  UPDATE user_listening_genre_contributors w
  SET
    play_count = w.play_count + COALESCE(l.play_count, 0),
    updated_at = now()
  FROM user_listening_genre_contributors l
  WHERE l.artist_id = p_loser
    AND w.artist_id = p_winner
    AND w.user_id = l.user_id
    AND w.genre = l.genre
    AND w.week_start IS NOT DISTINCT FROM l.week_start
    AND w.month IS NOT DISTINCT FROM l.month
    AND w.year IS NOT DISTINCT FROM l.year;

  DELETE FROM user_listening_genre_contributors l
  WHERE l.artist_id = p_loser
    AND EXISTS (
      SELECT 1 FROM user_listening_genre_contributors w
      WHERE w.artist_id = p_winner
        AND w.user_id = l.user_id
        AND w.genre = l.genre
        AND w.week_start IS NOT DISTINCT FROM l.week_start
        AND w.month IS NOT DISTINCT FROM l.month
        AND w.year IS NOT DISTINCT FROM l.year
    );

  UPDATE user_listening_genre_contributors SET artist_id = p_winner WHERE artist_id = p_loser;

  UPDATE entity_stats w
  SET
    play_count = w.play_count + COALESCE(l.play_count, 0),
    review_count = w.review_count + COALESCE(l.review_count, 0),
    favorite_count = w.favorite_count + COALESCE(l.favorite_count, 0),
    updated_at = now()
  FROM entity_stats l
  WHERE l.entity_type = 'artist'
    AND l.entity_id = p_loser
    AND w.entity_type = 'artist'
    AND w.entity_id = p_winner;

  DELETE FROM entity_stats WHERE entity_type = 'artist' AND entity_id = p_loser;

  UPDATE entity_stats SET entity_id = p_winner
  WHERE entity_type = 'artist' AND entity_id = p_loser;

  UPDATE user_listening_aggregates w
  SET
    count = w.count + l.count,
    updated_at = now()
  FROM user_listening_aggregates l
  WHERE l.entity_type = 'artist'
    AND l.entity_id = p_loser::text
    AND w.entity_type = 'artist'
    AND w.entity_id = p_winner::text
    AND w.user_id = l.user_id
    AND w.week_start IS NOT DISTINCT FROM l.week_start
    AND w.month IS NOT DISTINCT FROM l.month
    AND w.year IS NOT DISTINCT FROM l.year;

  DELETE FROM user_listening_aggregates
  WHERE entity_type = 'artist' AND entity_id = p_loser::text;

  UPDATE user_listening_aggregates SET entity_id = p_winner::text
  WHERE entity_type = 'artist' AND entity_id = p_loser::text;

  UPDATE notifications SET entity_id = p_winner::text
  WHERE entity_type = 'artist' AND entity_id = p_loser::text;

  UPDATE weekly_reports SET top_artist_id = p_winner WHERE top_artist_id = p_loser;

  UPDATE user_top_artists w
  SET listen_count = w.listen_count + l.listen_count
  FROM user_top_artists l
  WHERE l.artist_id = p_loser
    AND w.artist_id = p_winner
    AND w.user_id = l.user_id
    AND w.period = l.period;

  DELETE FROM user_top_artists l
  WHERE l.artist_id = p_loser
    AND EXISTS (
      SELECT 1 FROM user_top_artists w
      WHERE w.artist_id = p_winner
        AND w.user_id = l.user_id
        AND w.period = l.period
    );

  UPDATE user_top_artists SET artist_id = p_winner WHERE artist_id = p_loser;

  PERFORM public.repoint_community_feed_artist_merge(p_loser, p_winner);

  DELETE FROM artists WHERE id = p_loser;
END;
$$;
