-- 012_likes_comments_on_reviews.sql
-- Move likes and comments to reference reviews instead of passive logs.

-- Drop existing tables and recreate pointing to reviews.
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS likes CASCADE;

CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, review_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_review ON likes(review_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_review ON comments(review_id);

-- Add unique constraint for dedup on logs if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'logs_user_song_played_unique'
  ) THEN
    ALTER TABLE logs ADD CONSTRAINT logs_user_song_played_unique
      UNIQUE (user_id, spotify_song_id, played_at);
  END IF;
END $$;
