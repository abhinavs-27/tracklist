-- Canonical music catalog: UUID primary keys for artists/albums/tracks + external_id mappings
-- (Spotify, Last.fm). Migrates legacy TEXT ids (Spotify catalog ids and synthetic lfm:* keys).
--
-- After apply: join track_external_ids / album_external_ids / artist_external_ids when resolving
-- provider-specific ids. Application code uses canonical UUIDs in logs, reviews, and stats.

-- ---------------------------------------------------------------------------
-- 1. Drop discovery materialized views (recreated at end)
-- ---------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_trending_entities;
DROP MATERIALIZED VIEW IF EXISTS mv_rising_artists;
DROP MATERIALIZED VIEW IF EXISTS mv_hidden_gems;

-- ---------------------------------------------------------------------------
-- 2. External source enum + rename legacy catalog tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  CREATE TYPE music_external_source AS ENUM ('spotify', 'lastfm');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS artists RENAME TO _legacy_artists;
ALTER TABLE IF EXISTS albums RENAME TO _legacy_albums;
ALTER TABLE IF EXISTS songs RENAME TO _legacy_songs;

-- Index names are unique per schema; RENAME TABLE does not rename indexes. Free names used by
-- earlier migrations (009 idx_albums_artist, 062 idx_artists_updated_at) for the new tables below.
ALTER INDEX IF EXISTS idx_artists_updated_at RENAME TO idx_legacy_artists_updated_at;
ALTER INDEX IF EXISTS idx_albums_artist RENAME TO idx_legacy_albums_artist;

-- ---------------------------------------------------------------------------
-- 3. Migration map tables (dropped after cutover)
-- ---------------------------------------------------------------------------
CREATE TABLE _mig_artist_map (old_id TEXT PRIMARY KEY, new_id UUID NOT NULL UNIQUE);
CREATE TABLE _mig_album_map (old_id TEXT PRIMARY KEY, new_id UUID NOT NULL UNIQUE);
CREATE TABLE _mig_track_map (old_id TEXT PRIMARY KEY, new_id UUID NOT NULL UNIQUE);

INSERT INTO _mig_artist_map (old_id, new_id)
SELECT id, gen_random_uuid() FROM _legacy_artists;

INSERT INTO _mig_album_map (old_id, new_id)
SELECT id, gen_random_uuid() FROM _legacy_albums;

INSERT INTO _mig_track_map (old_id, new_id)
SELECT id, gen_random_uuid() FROM _legacy_songs;

-- ---------------------------------------------------------------------------
-- 4. New core tables
-- ---------------------------------------------------------------------------
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(both from name))) STORED,
  image_url TEXT,
  genres TEXT[],
  popularity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lastfm_name TEXT,
  lastfm_fetched_at TIMESTAMPTZ,
  lastfm_listeners BIGINT,
  lastfm_playcount BIGINT,
  data_source TEXT NOT NULL DEFAULT 'lastfm',
  needs_spotify_enrichment BOOLEAN NOT NULL DEFAULT FALSE,
  spotify_match_confidence REAL,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artists_name_normalized ON artists (name_normalized);
CREATE INDEX IF NOT EXISTS idx_artists_updated_at ON artists (updated_at);

CREATE TABLE albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(both from name))) STORED,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  image_url TEXT,
  release_date TEXT,
  total_tracks INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
CREATE INDEX IF NOT EXISTS idx_albums_name_normalized ON albums (name_normalized);

CREATE TABLE tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(both from name))) STORED,
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
  album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
  duration_ms INTEGER,
  track_number INTEGER,
  popularity SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lastfm_name TEXT,
  lastfm_artist_name TEXT,
  data_source TEXT NOT NULL DEFAULT 'lastfm',
  needs_spotify_enrichment BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT tracks_lfm_pending_or_catalog_full CHECK (
    (album_id IS NOT NULL AND artist_id IS NOT NULL)
    OR (lastfm_name IS NOT NULL AND lastfm_artist_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_lastfm_pair ON tracks (lastfm_artist_name, lastfm_name)
  WHERE lastfm_name IS NOT NULL AND lastfm_artist_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks(artist_id);

-- ---------------------------------------------------------------------------
-- 5. External id mapping tables
-- ---------------------------------------------------------------------------
CREATE TABLE artist_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  source music_external_source NOT NULL,
  external_id TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_external_ids_artist ON artist_external_ids(artist_id);

CREATE TABLE album_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  source music_external_source NOT NULL,
  external_id TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_album_external_ids_album ON album_external_ids(album_id);

CREATE TABLE track_external_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source music_external_source NOT NULL,
  external_id TEXT NOT NULL,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_track_external_ids_track ON track_external_ids(track_id);

-- ---------------------------------------------------------------------------
-- 6. Row level security (read-only catalog for clients)
-- ---------------------------------------------------------------------------
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_external_ids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artists_select_all" ON artists FOR SELECT USING (true);
CREATE POLICY "albums_select_all" ON albums FOR SELECT USING (true);
CREATE POLICY "tracks_select_all" ON tracks FOR SELECT USING (true);
CREATE POLICY "artist_external_ids_select_all" ON artist_external_ids FOR SELECT USING (true);
CREATE POLICY "album_external_ids_select_all" ON album_external_ids FOR SELECT USING (true);
CREATE POLICY "track_external_ids_select_all" ON track_external_ids FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 7. Copy rows from legacy + populate external ids
-- ---------------------------------------------------------------------------
INSERT INTO artists (
  id, name, image_url, genres, popularity, created_at, updated_at, cached_at,
  lastfm_name, lastfm_fetched_at, lastfm_listeners, lastfm_playcount,
  data_source, needs_spotify_enrichment, spotify_match_confidence, last_updated
)
SELECT
  m.new_id,
  o.name,
  o.image_url,
  o.genres,
  o.popularity,
  o.created_at,
  o.updated_at,
  COALESCE(o.cached_at, o.updated_at),
  o.lastfm_name,
  o.lastfm_fetched_at,
  o.lastfm_listeners,
  o.lastfm_playcount,
  COALESCE(o.data_source, 'spotify'),
  COALESCE(o.needs_spotify_enrichment, FALSE),
  o.spotify_match_confidence,
  COALESCE(o.last_updated, o.updated_at)
FROM _legacy_artists o
JOIN _mig_artist_map m ON m.old_id = o.id;

INSERT INTO artist_external_ids (artist_id, source, external_id)
SELECT ma.new_id,
  CASE WHEN o.id LIKE 'lfm:%' THEN 'lastfm'::music_external_source ELSE 'spotify'::music_external_source END,
  o.id
FROM _legacy_artists o
JOIN _mig_artist_map ma ON ma.old_id = o.id
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO artist_external_ids (artist_id, source, external_id)
SELECT ma.new_id, 'spotify'::music_external_source, trim(o.spotify_id)
FROM _legacy_artists o
JOIN _mig_artist_map ma ON ma.old_id = o.id
WHERE o.spotify_id IS NOT NULL AND length(trim(o.spotify_id)) > 0
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO albums (
  id, name, artist_id, image_url, release_date, total_tracks,
  created_at, updated_at, cached_at
)
SELECT
  m.new_id,
  o.name,
  ma.new_id,
  o.image_url,
  o.release_date,
  o.total_tracks,
  o.created_at,
  o.updated_at,
  COALESCE(o.cached_at, o.updated_at)
FROM _legacy_albums o
JOIN _mig_album_map m ON m.old_id = o.id
JOIN _mig_artist_map ma ON ma.old_id = o.artist_id;

INSERT INTO album_external_ids (album_id, source, external_id)
SELECT mb.new_id,
  CASE WHEN o.id LIKE 'lfm:%' THEN 'lastfm'::music_external_source ELSE 'spotify'::music_external_source END,
  o.id
FROM _legacy_albums o
JOIN _mig_album_map mb ON mb.old_id = o.id
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO tracks (
  id, name, artist_id, album_id, duration_ms, track_number, popularity,
  created_at, updated_at, cached_at,
  lastfm_name, lastfm_artist_name, data_source, needs_spotify_enrichment
)
SELECT
  mt.new_id,
  o.name,
  CASE WHEN o.artist_id IS NULL THEN NULL ELSE ma.new_id END,
  CASE WHEN o.album_id IS NULL THEN NULL ELSE mb.new_id END,
  o.duration_ms,
  o.track_number,
  o.popularity,
  o.created_at,
  o.updated_at,
  COALESCE(o.cached_at, o.updated_at),
  o.lastfm_name,
  o.lastfm_artist_name,
  COALESCE(o.data_source, 'spotify'),
  COALESCE(o.needs_spotify_enrichment, FALSE)
FROM _legacy_songs o
JOIN _mig_track_map mt ON mt.old_id = o.id
LEFT JOIN _mig_artist_map ma ON ma.old_id = o.artist_id
LEFT JOIN _mig_album_map mb ON mb.old_id = o.album_id;

INSERT INTO track_external_ids (track_id, source, external_id)
SELECT mt.new_id,
  CASE WHEN o.id LIKE 'lfm:%' THEN 'lastfm'::music_external_source ELSE 'spotify'::music_external_source END,
  o.id
FROM _legacy_songs o
JOIN _mig_track_map mt ON mt.old_id = o.id
ON CONFLICT (source, external_id) DO NOTHING;

INSERT INTO track_external_ids (track_id, source, external_id)
SELECT mt.new_id, 'spotify'::music_external_source, trim(o.spotify_id)
FROM _legacy_songs o
JOIN _mig_track_map mt ON mt.old_id = o.id
WHERE o.spotify_id IS NOT NULL AND length(trim(o.spotify_id)) > 0
ON CONFLICT (source, external_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Drop FKs that still point at legacy artists, then rewrite referencing columns
-- ---------------------------------------------------------------------------
ALTER TABLE user_favorite_artists DROP CONSTRAINT IF EXISTS user_favorite_artists_artist_id_fkey;
ALTER TABLE user_listening_genre_contributors DROP CONSTRAINT IF EXISTS user_listening_genre_contributors_artist_id_fkey;

DELETE FROM user_favorite_artists ufa
WHERE NOT EXISTS (SELECT 1 FROM _mig_artist_map m WHERE m.old_id = ufa.artist_id);

UPDATE user_favorite_artists ufa
SET artist_id = m.new_id::text
FROM _mig_artist_map m
WHERE m.old_id = ufa.artist_id;

ALTER TABLE user_favorite_artists
  ALTER COLUMN artist_id TYPE UUID USING (artist_id::uuid);

ALTER TABLE user_favorite_artists
  ADD CONSTRAINT user_favorite_artists_artist_id_fkey
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE;

DELETE FROM user_listening_genre_contributors u
WHERE NOT EXISTS (SELECT 1 FROM _mig_artist_map m WHERE m.old_id = u.artist_id);

UPDATE user_listening_genre_contributors u
SET artist_id = m.new_id::text
FROM _mig_artist_map m
WHERE m.old_id = u.artist_id;

ALTER TABLE user_listening_genre_contributors
  ALTER COLUMN artist_id TYPE UUID USING (artist_id::uuid);

ALTER TABLE user_listening_genre_contributors
  ADD CONSTRAINT user_listening_genre_contributors_artist_id_fkey
  FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE;

DELETE FROM user_favorite_albums ufa
WHERE NOT EXISTS (SELECT 1 FROM _mig_album_map m WHERE m.old_id = ufa.album_id);

UPDATE user_favorite_albums ufa
SET album_id = mb.new_id::text
FROM _mig_album_map mb
WHERE mb.old_id = ufa.album_id;

ALTER TABLE user_favorite_albums
  ALTER COLUMN album_id TYPE UUID USING (album_id::uuid);

ALTER TABLE user_favorite_albums
  ADD CONSTRAINT user_favorite_albums_album_id_fkey
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 9. logs: canonical UUID track / album / artist
-- ---------------------------------------------------------------------------
ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_user_track_listened_unique;

DELETE FROM logs l
WHERE NOT EXISTS (SELECT 1 FROM _mig_track_map m WHERE m.old_id = l.track_id);

UPDATE logs l
SET track_id = m.new_id::text
FROM _mig_track_map m
WHERE m.old_id = l.track_id;

UPDATE logs l
SET album_id = m.new_id::text
FROM _mig_album_map m
WHERE l.album_id IS NOT NULL AND l.album_id = m.old_id;

UPDATE logs l
SET album_id = NULL
WHERE l.album_id IS NOT NULL
  AND l.album_id NOT IN (SELECT new_id::text FROM _mig_album_map);

UPDATE logs l
SET artist_id = m.new_id::text
FROM _mig_artist_map m
WHERE l.artist_id IS NOT NULL AND l.artist_id = m.old_id;

UPDATE logs l
SET artist_id = NULL
WHERE l.artist_id IS NOT NULL
  AND l.artist_id NOT IN (SELECT new_id::text FROM _mig_artist_map);

ALTER TABLE logs
  ALTER COLUMN track_id TYPE UUID USING (track_id::uuid);

ALTER TABLE logs
  ALTER COLUMN album_id TYPE UUID USING (album_id::uuid);

ALTER TABLE logs
  ALTER COLUMN artist_id TYPE UUID USING (artist_id::uuid);

ALTER TABLE logs ADD CONSTRAINT logs_user_track_listened_unique
  UNIQUE (user_id, track_id, listened_at);

-- ---------------------------------------------------------------------------
-- 10. reviews, list_items, stats tables, aggregates, notifications, weekly_reports, spotify_recent_tracks
-- (PG forbids subqueries in ALTER COLUMN ... USING; use UPDATE + cast.)
-- ---------------------------------------------------------------------------
DELETE FROM reviews r
WHERE r.entity_type = 'song' AND NOT EXISTS (SELECT 1 FROM _mig_track_map m WHERE m.old_id = r.entity_id);
DELETE FROM reviews r
WHERE r.entity_type = 'album' AND NOT EXISTS (SELECT 1 FROM _mig_album_map m WHERE m.old_id = r.entity_id);
DELETE FROM reviews r
WHERE r.entity_type = 'artist' AND NOT EXISTS (SELECT 1 FROM _mig_artist_map m WHERE m.old_id = r.entity_id);

UPDATE reviews r
SET entity_id = m.new_id::text
FROM _mig_track_map m
WHERE r.entity_type = 'song' AND r.entity_id = m.old_id;

UPDATE reviews r
SET entity_id = m.new_id::text
FROM _mig_album_map m
WHERE r.entity_type = 'album' AND r.entity_id = m.old_id;

UPDATE reviews r
SET entity_id = m.new_id::text
FROM _mig_artist_map m
WHERE r.entity_type = 'artist' AND r.entity_id = m.old_id;

ALTER TABLE reviews
  ALTER COLUMN entity_id TYPE UUID USING (entity_id::uuid);

DELETE FROM list_items li
WHERE li.entity_type = 'song' AND NOT EXISTS (SELECT 1 FROM _mig_track_map m WHERE m.old_id = li.entity_id);
DELETE FROM list_items li
WHERE li.entity_type = 'album' AND NOT EXISTS (SELECT 1 FROM _mig_album_map m WHERE m.old_id = li.entity_id);

UPDATE list_items li
SET entity_id = m.new_id::text
FROM _mig_track_map m
WHERE li.entity_type = 'song' AND li.entity_id = m.old_id;

UPDATE list_items li
SET entity_id = m.new_id::text
FROM _mig_album_map m
WHERE li.entity_type = 'album' AND li.entity_id = m.old_id;

ALTER TABLE list_items
  ALTER COLUMN entity_id TYPE UUID USING (entity_id::uuid);

DELETE FROM track_stats ts
WHERE NOT EXISTS (SELECT 1 FROM _mig_track_map m WHERE m.old_id = ts.track_id);

UPDATE track_stats ts
SET track_id = m.new_id::text
FROM _mig_track_map m
WHERE m.old_id = ts.track_id;

ALTER TABLE track_stats
  ALTER COLUMN track_id TYPE UUID USING (track_id::uuid);

DELETE FROM album_stats als
WHERE NOT EXISTS (SELECT 1 FROM _mig_album_map m WHERE m.old_id = als.album_id);

UPDATE album_stats als
SET album_id = m.new_id::text
FROM _mig_album_map m
WHERE m.old_id = als.album_id;

ALTER TABLE album_stats
  ALTER COLUMN album_id TYPE UUID USING (album_id::uuid);

DELETE FROM entity_stats es
WHERE es.entity_type = 'song' AND NOT EXISTS (SELECT 1 FROM _mig_track_map m WHERE m.old_id = es.entity_id);
DELETE FROM entity_stats es
WHERE es.entity_type = 'album' AND NOT EXISTS (SELECT 1 FROM _mig_album_map m WHERE m.old_id = es.entity_id);
DELETE FROM entity_stats es
WHERE es.entity_type = 'artist' AND NOT EXISTS (SELECT 1 FROM _mig_artist_map m WHERE m.old_id = es.entity_id);

UPDATE entity_stats es
SET entity_id = m.new_id::text
FROM _mig_track_map m
WHERE es.entity_type = 'song' AND es.entity_id = m.old_id;

UPDATE entity_stats es
SET entity_id = m.new_id::text
FROM _mig_album_map m
WHERE es.entity_type = 'album' AND es.entity_id = m.old_id;

UPDATE entity_stats es
SET entity_id = m.new_id::text
FROM _mig_artist_map m
WHERE es.entity_type = 'artist' AND es.entity_id = m.old_id;

ALTER TABLE entity_stats
  ALTER COLUMN entity_id TYPE UUID USING (entity_id::uuid);

UPDATE user_listening_aggregates u
SET entity_id = m.new_id::text
FROM _mig_track_map m
WHERE u.entity_type = 'track' AND u.entity_id = m.old_id;

UPDATE user_listening_aggregates u
SET entity_id = m.new_id::text
FROM _mig_album_map m
WHERE u.entity_type = 'album' AND u.entity_id = m.old_id;

UPDATE user_listening_aggregates u
SET entity_id = m.new_id::text
FROM _mig_artist_map m
WHERE u.entity_type = 'artist' AND u.entity_id = m.old_id;

-- Genre rows keep human-readable keys; catalog rows now store canonical UUID strings in TEXT.
-- (No type change on user_listening_aggregates.entity_id.)

UPDATE notifications n
SET entity_id = m.new_id::text
FROM _mig_track_map m
WHERE n.entity_type = 'song' AND n.entity_id = m.old_id;

UPDATE notifications n
SET entity_id = m.new_id::text
FROM _mig_album_map m
WHERE n.entity_type = 'album' AND n.entity_id = m.old_id;

UPDATE notifications n
SET entity_id = m.new_id::text
FROM _mig_artist_map m
WHERE n.entity_type = 'artist' AND n.entity_id = m.old_id;

UPDATE weekly_reports wr
SET top_artist_id = m.new_id::text
FROM _mig_artist_map m
WHERE wr.top_artist_id IS NOT NULL AND wr.top_artist_id = m.old_id;

UPDATE weekly_reports wr
SET top_artist_id = NULL
WHERE wr.top_artist_id IS NOT NULL
  AND wr.top_artist_id NOT IN (SELECT new_id::text FROM _mig_artist_map);

UPDATE weekly_reports wr
SET top_album_id = m.new_id::text
FROM _mig_album_map m
WHERE wr.top_album_id IS NOT NULL AND wr.top_album_id = m.old_id;

UPDATE weekly_reports wr
SET top_album_id = NULL
WHERE wr.top_album_id IS NOT NULL
  AND wr.top_album_id NOT IN (SELECT new_id::text FROM _mig_album_map);

UPDATE weekly_reports wr
SET top_track_id = m.new_id::text
FROM _mig_track_map m
WHERE wr.top_track_id IS NOT NULL AND wr.top_track_id = m.old_id;

UPDATE weekly_reports wr
SET top_track_id = NULL
WHERE wr.top_track_id IS NOT NULL
  AND wr.top_track_id NOT IN (SELECT new_id::text FROM _mig_track_map);

ALTER TABLE weekly_reports
  ALTER COLUMN top_artist_id TYPE UUID USING (top_artist_id::uuid);

ALTER TABLE weekly_reports
  ALTER COLUMN top_album_id TYPE UUID USING (top_album_id::uuid);

ALTER TABLE weekly_reports
  ALTER COLUMN top_track_id TYPE UUID USING (top_track_id::uuid);

-- Orphan recent-track rows (unknown legacy id) cannot map; remove before NOT NULL UUID cast.
DELETE FROM spotify_recent_tracks srt
WHERE NOT EXISTS (
  SELECT 1 FROM _mig_track_map m WHERE m.old_id = srt.track_id
);

UPDATE spotify_recent_tracks srt
SET track_id = m.new_id::text
FROM _mig_track_map m
WHERE m.old_id = srt.track_id;

ALTER TABLE spotify_recent_tracks
  ALTER COLUMN track_id TYPE UUID USING (track_id::uuid);

UPDATE spotify_recent_tracks srt
SET album_id = m.new_id::text
FROM _mig_album_map m
WHERE srt.album_id IS NOT NULL AND srt.album_id = m.old_id;

UPDATE spotify_recent_tracks srt
SET album_id = NULL
WHERE srt.album_id IS NOT NULL
  AND srt.album_id NOT IN (SELECT new_id::text FROM _mig_album_map);

ALTER TABLE spotify_recent_tracks
  ALTER COLUMN album_id TYPE UUID USING (album_id::uuid);

-- ---------------------------------------------------------------------------
-- 10b. user_top_albums / user_top_artists (legacy TEXT ids)
-- ---------------------------------------------------------------------------
DELETE FROM user_top_albums u
WHERE NOT EXISTS (SELECT 1 FROM _mig_album_map m WHERE m.old_id = u.album_id);

UPDATE user_top_albums u
SET album_id = m.new_id::text
FROM _mig_album_map m
WHERE m.old_id = u.album_id;

ALTER TABLE user_top_albums
  ALTER COLUMN album_id TYPE UUID USING (album_id::uuid);

DELETE FROM user_top_artists u
WHERE NOT EXISTS (SELECT 1 FROM _mig_artist_map m WHERE m.old_id = u.artist_id);

UPDATE user_top_artists u
SET artist_id = m.new_id::text
FROM _mig_artist_map m
WHERE m.old_id = u.artist_id;

ALTER TABLE user_top_artists
  ALTER COLUMN artist_id TYPE UUID USING (artist_id::uuid);

-- user_listening_aggregates.entity_id remains TEXT: UUID strings for track/album/artist, plain text for genre.

-- ---------------------------------------------------------------------------
-- 11. Drop legacy catalog + map tables
-- ---------------------------------------------------------------------------
DROP TABLE _legacy_songs;
DROP TABLE _legacy_albums;
DROP TABLE _legacy_artists;
DROP TABLE _mig_track_map;
DROP TABLE _mig_album_map;
DROP TABLE _mig_artist_map;
