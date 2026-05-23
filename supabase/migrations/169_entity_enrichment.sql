-- supabase/migrations/169_entity_enrichment.sql

-- ── Extend existing tables ────────────────────────────────────────────────────

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS is_producer         BOOL        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_songwriter       BOOL        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio                 TEXT,
  ADD COLUMN IF NOT EXISTS bio_source          TEXT,        -- 'lastfm' | 'wikipedia' | 'musicbrainz'
  ADD COLUMN IF NOT EXISTS bio_enriched_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mbid                TEXT,
  ADD COLUMN IF NOT EXISTS external_links      JSONB,
  ADD COLUMN IF NOT EXISTS credits_enriched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS artists_mbid_unique ON artists (mbid) WHERE mbid IS NOT NULL;

ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS bio                 TEXT,
  ADD COLUMN IF NOT EXISTS bio_source          TEXT,
  ADD COLUMN IF NOT EXISTS bio_enriched_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mbid                TEXT,
  ADD COLUMN IF NOT EXISTS release_type        TEXT,        -- 'album' | 'ep' | 'live' | 'compilation' | 'single'
  ADD COLUMN IF NOT EXISTS credits_enriched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS albums_mbid_unique ON albums (mbid) WHERE mbid IS NOT NULL;

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS mbid                TEXT,
  ADD COLUMN IF NOT EXISTS credits_enriched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS tracks_mbid_unique ON tracks (mbid) WHERE mbid IS NOT NULL;

-- ── Labels ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labels (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  name_normalized  TEXT GENERATED ALWAYS AS (lower(trim(both from name))) STORED,
  mbid             TEXT        UNIQUE,
  bio              TEXT,
  bio_source       TEXT,
  country          TEXT,
  founded_year     INT,
  image_url        TEXT,
  external_links   JSONB,
  enriched_at      TIMESTAMPTZ,
  bio_enriched_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labels_name_normalized_idx ON labels (name_normalized);

-- ── Junction tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artist_labels (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   UUID  NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  label_id    UUID  NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
  start_year  INT,
  end_year    INT,
  is_current  BOOL  NOT NULL DEFAULT false
);
-- When start_year is known, enforce no duplicate (artist, label, year) combos
CREATE UNIQUE INDEX IF NOT EXISTS artist_labels_with_year ON artist_labels (artist_id, label_id, start_year) WHERE start_year IS NOT NULL;
-- When start_year unknown, enforce at most one unknown-period entry per (artist, label)
CREATE UNIQUE INDEX IF NOT EXISTS artist_labels_no_year ON artist_labels (artist_id, label_id) WHERE start_year IS NULL;

CREATE TABLE IF NOT EXISTS album_labels (
  album_id   UUID  NOT NULL REFERENCES albums(id)  ON DELETE CASCADE,
  label_id   UUID  NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
  PRIMARY KEY (album_id, label_id)
);

CREATE TABLE IF NOT EXISTS album_producers (
  album_id   UUID  NOT NULL REFERENCES albums(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (album_id, artist_id)
);

CREATE TABLE IF NOT EXISTS album_songwriters (
  album_id   UUID  NOT NULL REFERENCES albums(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (album_id, artist_id)
);

CREATE TABLE IF NOT EXISTS song_producers (
  song_id    UUID  NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE IF NOT EXISTS song_songwriters (
  song_id    UUID  NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE IF NOT EXISTS song_samples (
  song_id         UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  sampled_song_id UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, sampled_song_id)
);

CREATE TABLE IF NOT EXISTS song_covers (
  song_id          UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  original_song_id UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, original_song_id)
);

CREATE TABLE IF NOT EXISTS artist_members (
  artist_id        UUID  NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  member_artist_id UUID  NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role             TEXT,
  is_active        BOOL  NOT NULL DEFAULT true,
  PRIMARY KEY (artist_id, member_artist_id)
);

-- Featuring artists (tracks only store primary artist_id; features go here)
CREATE TABLE IF NOT EXISTS track_featuring_artists (
  track_id   UUID  NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (track_id, artist_id)
);

-- ── Reverse-direction indexes ─────────────────────────────────────────────────

-- Label detail page: "which artists/albums are on label X?"
CREATE INDEX IF NOT EXISTS artist_labels_label_id_idx            ON artist_labels            (label_id);
CREATE INDEX IF NOT EXISTS album_labels_label_id_idx             ON album_labels             (label_id);

-- Producer/songwriter pages: "which albums/songs did artist X produce/write?"
CREATE INDEX IF NOT EXISTS album_producers_artist_id_idx         ON album_producers          (artist_id);
CREATE INDEX IF NOT EXISTS album_songwriters_artist_id_idx       ON album_songwriters        (artist_id);
CREATE INDEX IF NOT EXISTS song_producers_artist_id_idx          ON song_producers           (artist_id);
CREATE INDEX IF NOT EXISTS song_songwriters_artist_id_idx        ON song_songwriters         (artist_id);
CREATE INDEX IF NOT EXISTS track_featuring_artists_artist_id_idx ON track_featuring_artists  (artist_id);

-- "Which bands is person X a member of?" (reverse lookup)
CREATE INDEX IF NOT EXISTS artist_members_member_artist_id_idx   ON artist_members           (member_artist_id);

-- "What songs sample/cover this track?"
CREATE INDEX IF NOT EXISTS song_samples_sampled_song_id_idx      ON song_samples             (sampled_song_id);
CREATE INDEX IF NOT EXISTS song_covers_original_song_id_idx      ON song_covers              (original_song_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE labels                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_labels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_labels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_producers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_songwriters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_producers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_songwriters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_samples           ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_covers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_featuring_artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "labels_select_all"                  ON labels                  FOR SELECT USING (true);
CREATE POLICY "artist_labels_select_all"           ON artist_labels           FOR SELECT USING (true);
CREATE POLICY "album_labels_select_all"            ON album_labels            FOR SELECT USING (true);
CREATE POLICY "album_producers_select_all"         ON album_producers         FOR SELECT USING (true);
CREATE POLICY "album_songwriters_select_all"       ON album_songwriters       FOR SELECT USING (true);
CREATE POLICY "song_producers_select_all"          ON song_producers          FOR SELECT USING (true);
CREATE POLICY "song_songwriters_select_all"        ON song_songwriters        FOR SELECT USING (true);
CREATE POLICY "song_samples_select_all"            ON song_samples            FOR SELECT USING (true);
CREATE POLICY "song_covers_select_all"             ON song_covers             FOR SELECT USING (true);
CREATE POLICY "artist_members_select_all"          ON artist_members          FOR SELECT USING (true);
CREATE POLICY "track_featuring_artists_select_all" ON track_featuring_artists FOR SELECT USING (true);
