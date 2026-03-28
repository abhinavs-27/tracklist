-- Onboarding / profile: favorite artists (distinct from album favorites).

CREATE TABLE IF NOT EXISTS user_favorite_artists (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position >= 0 AND position < 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_artists_user_position
  ON user_favorite_artists(user_id, position);

ALTER TABLE user_favorite_artists ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_favorite_artists IS 'User-selected favorite artists (onboarding + profile).';
