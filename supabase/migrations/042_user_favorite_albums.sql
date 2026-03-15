-- 042_user_favorite_albums.sql
-- Per-user favorite albums (up to 4) for profiles and onboarding.

CREATE TABLE IF NOT EXISTS user_favorite_albums (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (user_id, position),
  CHECK (position BETWEEN 1 AND 4)
);

CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_user
  ON user_favorite_albums(user_id);

