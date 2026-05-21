-- supabase/migrations/167_preferred_genres.sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_genres TEXT[] NOT NULL DEFAULT '{}';
