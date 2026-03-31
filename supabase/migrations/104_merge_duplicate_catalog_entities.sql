-- One-time merge of duplicate canonical rows (same normalized name + parent keys).
-- Logs: UPDATE track_id / album_id only; duplicate (user_id, track_id, listened_at) rows are
-- deduped by deleting higher id (no net loss of listen events beyond duplicates).
--
-- Requires: 101, 103 (repoint_community_feed_track_merge / _artist_merge). Apply after 102.

-- ---------------------------------------------------------------------------
-- Community feed: album ids in listen / review / list_update payloads
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repoint_community_feed_album_merge(p_loser uuid, p_winner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_loser = p_winner THEN RETURN; END IF;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{album_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'listen'
    AND (payload->>'album_id') IS NOT NULL
    AND (payload->>'album_id') = p_loser::text;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{entity_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'review'
    AND (payload->>'entity_type') = 'album'
    AND (payload->>'entity_id') = p_loser::text;

  UPDATE community_feed
  SET payload = jsonb_set(payload, '{entity_id}', to_jsonb(p_winner::text), true)
  WHERE event_type = 'list_update'
    AND (payload->>'entity_type') = 'album'
    AND (payload->>'entity_id') = p_loser::text;
END;
$$;

REVOKE ALL ON FUNCTION public.repoint_community_feed_album_merge(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repoint_community_feed_album_merge(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Merge one track (p_loser → p_winner)
-- ---------------------------------------------------------------------------
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
    AND l.entity_id = p_loser::text
    AND w.entity_type = 'song'
    AND w.entity_id = p_winner::text;

  DELETE FROM entity_stats WHERE entity_type = 'song' AND entity_id = p_loser::text;

  UPDATE entity_stats SET entity_id = p_winner::text
  WHERE entity_type = 'song' AND entity_id = p_loser::text;

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

  UPDATE spotify_recent_tracks SET track_id = p_winner WHERE track_id = p_loser;

  UPDATE weekly_reports SET top_track_id = p_winner WHERE top_track_id = p_loser;

  PERFORM public.repoint_community_feed_track_merge(p_loser, p_winner);

  DELETE FROM tracks WHERE id = p_loser;
END;
$$;

-- ---------------------------------------------------------------------------
-- Merge one album (p_loser → p_winner)
-- ---------------------------------------------------------------------------
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
    AND l.entity_id = p_loser::text
    AND w.entity_type = 'album'
    AND w.entity_id = p_winner::text;

  DELETE FROM entity_stats WHERE entity_type = 'album' AND entity_id = p_loser::text;

  UPDATE entity_stats SET entity_id = p_winner::text
  WHERE entity_type = 'album' AND entity_id = p_loser::text;

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

-- ---------------------------------------------------------------------------
-- Merge one artist (p_loser → p_winner)
-- ---------------------------------------------------------------------------
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

  UPDATE user_favorite_artists SET artist_id = p_winner WHERE artist_id = p_loser;

  DELETE FROM user_favorite_artists ufa1
  USING user_favorite_artists ufa2
  WHERE ufa1.user_id = ufa2.user_id
    AND ufa1.artist_id = ufa2.artist_id
    AND ufa1.position > ufa2.position;

  UPDATE user_listening_genre_contributors SET artist_id = p_winner WHERE artist_id = p_loser;

  UPDATE entity_stats w
  SET
    play_count = w.play_count + COALESCE(l.play_count, 0),
    review_count = w.review_count + COALESCE(l.review_count, 0),
    favorite_count = w.favorite_count + COALESCE(l.favorite_count, 0),
    updated_at = now()
  FROM entity_stats l
  WHERE l.entity_type = 'artist'
    AND l.entity_id = p_loser::text
    AND w.entity_type = 'artist'
    AND w.entity_id = p_winner::text;

  DELETE FROM entity_stats WHERE entity_type = 'artist' AND entity_id = p_loser::text;

  UPDATE entity_stats SET entity_id = p_winner::text
  WHERE entity_type = 'artist' AND entity_id = p_loser::text;

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

-- ---------------------------------------------------------------------------
-- Main: multiple rounds (tracks → albums → artists) until stable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_catalog_duplicate_entities(p_max_rounds INT DEFAULT 5)
RETURNS TABLE (round_num INT, tracks_merged BIGINT, albums_merged BIGINT, artists_merged BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i INT;
  tc BIGINT;
  ac BIGINT;
  arc BIGINT;
  rec RECORD;
BEGIN
  FOR i IN 1 .. GREATEST(1, LEAST(COALESCE(p_max_rounds, 5), 20)) LOOP
    tc := 0;
    ac := 0;
    arc := 0;

    FOR rec IN
      WITH g AS (
        SELECT
          array_agg(id ORDER BY created_at, id) AS ids
        FROM tracks
        GROUP BY
          artist_id,
          COALESCE(album_id, '00000000-0000-0000-0000-000000000000'::uuid),
          name_normalized
        HAVING COUNT(*) > 1
      )
      SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
      FROM g
    LOOP
      PERFORM public.merge_catalog_track_pair(rec.winner_id, rec.loser_id);
      tc := tc + 1;
    END LOOP;

    FOR rec IN
      WITH g AS (
        SELECT array_agg(id ORDER BY created_at, id) AS ids
        FROM albums
        GROUP BY artist_id, name_normalized
        HAVING COUNT(*) > 1
      )
      SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
      FROM g
    LOOP
      PERFORM public.merge_catalog_album_pair(rec.winner_id, rec.loser_id);
      ac := ac + 1;
    END LOOP;

    FOR rec IN
      WITH g AS (
        SELECT array_agg(id ORDER BY created_at, id) AS ids
        FROM artists
        GROUP BY name_normalized
        HAVING COUNT(*) > 1
      )
      SELECT (ids)[1] AS winner_id, unnest(ids[2:array_upper(ids, 1)]) AS loser_id
      FROM g
    LOOP
      PERFORM public.merge_catalog_artist_pair(rec.winner_id, rec.loser_id);
      arc := arc + 1;
    END LOOP;

    round_num := i;
    tracks_merged := tc;
    albums_merged := ac;
    artists_merged := arc;
    RETURN NEXT;

    EXIT WHEN tc = 0 AND ac = 0 AND arc = 0;
  END LOOP;

  PERFORM refresh_entity_stats();
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_catalog_track_pair(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_catalog_album_pair(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_catalog_artist_pair(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_catalog_duplicate_entities(INT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.merge_catalog_track_pair(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_album_pair(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_artist_pair(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_catalog_duplicate_entities(INT) TO service_role;

COMMENT ON FUNCTION public.merge_catalog_duplicate_entities(INT) IS
  'Merges duplicate artists (name_normalized), albums (artist_id + name_normalized), tracks (artist_id + album + name_normalized). Re-runs up to p_max_rounds until no merges. Logs: UPDATE + dedupe unique collisions only. Run: SELECT * FROM merge_catalog_duplicate_entities(5);';
