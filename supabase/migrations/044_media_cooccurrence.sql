-- 044_media_cooccurrence.sql
-- Co-occurrence table for "users who interacted with X also interacted with Y" recommendations.
-- Score = how frequently the two items appear together in user activity (normalized per content_id).

CREATE TABLE IF NOT EXISTS media_cooccurrence (
  content_type TEXT NOT NULL CHECK (content_type IN ('song', 'album')),
  content_id TEXT NOT NULL,
  related_content_id TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (content_type, content_id, related_content_id),
  CHECK (content_id != related_content_id)
);

CREATE INDEX IF NOT EXISTS idx_media_cooccurrence_lookup
  ON media_cooccurrence(content_type, content_id);

ALTER TABLE media_cooccurrence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_cooccurrence_select_all"
  ON media_cooccurrence FOR SELECT
  USING (true);

COMMENT ON TABLE media_cooccurrence IS 'Co-occurrence scores for song/song and album/album recommendations from user activity.';
