-- Multi-device Expo push tokens (replaces single users.expo_push_token).
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text CHECK (platform IN ('ios','android')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

-- Backfill existing single-column tokens.
INSERT INTO push_tokens (user_id, token)
SELECT id, expo_push_token
FROM users
WHERE expo_push_token IS NOT NULL
ON CONFLICT (token) DO NOTHING;

-- Old column left in place (no longer written); dropped in a later migration
-- once old app builds have aged out.
