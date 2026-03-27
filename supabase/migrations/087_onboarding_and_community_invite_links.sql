-- Token-based community invite links (share URL) + cold-start onboarding flag.

CREATE TABLE IF NOT EXISTS community_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_community_invite_links_community
  ON community_invite_links(community_id);

ALTER TABLE community_invite_links DISABLE ROW LEVEL SECURITY;

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

UPDATE users SET onboarding_completed = TRUE;

COMMENT ON TABLE community_invite_links IS 'Shareable invite URLs; distinct from user-targeted community_invites.';
COMMENT ON COLUMN users.onboarding_completed IS 'Cold-start profile onboarding (Last.fm CTA) dismissed or completed.';
