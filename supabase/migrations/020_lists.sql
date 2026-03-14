-- User-curated lists of albums/songs

CREATE TABLE IF NOT EXISTS lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lists_user_created ON lists(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('album', 'song')),
  entity_id TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_list_items_list_position ON list_items(list_id, position);
CREATE INDEX IF NOT EXISTS idx_list_items_entity ON list_items(entity_type, entity_id);

-- Auth enforced at API route level (NextAuth); RLS disabled for consistency with reviews, etc.
ALTER TABLE lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE list_items DISABLE ROW LEVEL SECURITY;
