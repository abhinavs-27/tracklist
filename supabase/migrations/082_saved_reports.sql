-- Saved listening report views (share / revisit).

CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'album', 'track', 'genre')),
  range_type TEXT NOT NULL CHECK (range_type IN ('week', 'month', 'year', 'custom')),
  start_date DATE,
  end_date DATE,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_user_created
  ON saved_reports (user_id, created_at DESC);

ALTER TABLE saved_reports DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE saved_reports IS 'User-saved listening report configurations; use is_public for /reports/shared/[id].';
