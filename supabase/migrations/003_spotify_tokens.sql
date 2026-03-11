-- Migration 003: Spotify OAuth token storage

CREATE TABLE IF NOT EXISTS spotify_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security: tokens must never be readable/writable by the anon client.
-- Enable RLS and define no policies. Service role key (server) bypasses RLS.
ALTER TABLE spotify_tokens ENABLE ROW LEVEL SECURITY;

-- Helpful index for background sync jobs (if added later)
CREATE INDEX IF NOT EXISTS idx_spotify_tokens_expires_at ON spotify_tokens(expires_at);

