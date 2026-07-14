-- 195_index_cleanup_drift.sql
-- Formalize the index changes made directly against production during the
-- 2026-07-13 DB-size cleanup, so a fresh DB reproduces the same state.
--
-- Two kinds of change:
--   1. Drop redundant indexes. Each dropped index had an identical or fully-covering
--      twin that remains, so query plans just fall back to the twin — no behaviour
--      change, only reclaimed space and less write amplification. These accumulated
--      over years of migrations that each added a slightly-differently-named index for
--      the same columns.
--   2. Add FK indexes that were genuinely missing on small child tables of `tracks`,
--      which caused per-row sequential scans during ON DELETE CASCADE.
--
-- NOTE: the one-time deletion of ~1.85M unreferenced catalog `tracks` rows and the
-- top-50 prune of `media_cooccurrence` are DATA cleanups, intentionally NOT encoded
-- here — a fresh/other environment has no such orphans, and migrations must not delete
-- catalog data on every run. media_cooccurrence stays bounded going forward via 194.

------------------------------------------------------------------------------
-- 1. Drop redundant indexes (an identical/covering index remains for each)
------------------------------------------------------------------------------

-- tracks: byte-identical duplicates of idx_tracks_album_id / idx_tracks_artist_id
DROP INDEX IF EXISTS idx_tracks_album;   -- == idx_tracks_album_id  (album_id)
DROP INDEX IF EXISTS idx_tracks_artist;  -- == idx_tracks_artist_id (artist_id)

-- logs: 379MB of index on 52MB of data; these each duplicate a twin that stays.
DROP INDEX IF EXISTS idx_logs_user_listened_at_desc;  -- == idx_logs_user_listened_at   (user_id, listened_at DESC)
DROP INDEX IF EXISTS idx_logs_listened_at_track_id;   -- == idx_logs_listened_at_track   (listened_at DESC, track_id)
DROP INDEX IF EXISTS idx_logs_track_listened_at;      -- == idx_logs_track_id_listened_at(track_id, listened_at DESC)
DROP INDEX IF EXISTS idx_logs_user_id_track_id;       -- == idx_logs_user_track          (user_id, track_id)
DROP INDEX IF EXISTS idx_logs_user;                   -- == idx_logs_user_id             (user_id)
DROP INDEX IF EXISTS idx_logs_created_at;             -- covered by idx_logs_created_at_id (created_at, id) via reverse scan

------------------------------------------------------------------------------
-- 2. Add missing ON DELETE CASCADE FK indexes on small child tables of tracks
------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_song_samples_song_id          ON song_samples(song_id);
CREATE INDEX IF NOT EXISTS idx_song_covers_song_id           ON song_covers(song_id);
CREATE INDEX IF NOT EXISTS idx_song_producers_song_id        ON song_producers(song_id);
CREATE INDEX IF NOT EXISTS idx_song_songwriters_song_id      ON song_songwriters(song_id);
CREATE INDEX IF NOT EXISTS idx_track_featuring_artists_track_id ON track_featuring_artists(track_id);
