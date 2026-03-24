-- Cached computed taste identity (rebuilt server-side when stale, e.g. >6h).

CREATE TABLE IF NOT EXISTS taste_identity_cache (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taste_identity_cache_updated_at ON taste_identity_cache (updated_at DESC);

ALTER TABLE taste_identity_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE taste_identity_cache IS 'Server-only cache for GET /api/taste-identity; use service role.';
