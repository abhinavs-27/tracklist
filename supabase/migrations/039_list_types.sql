-- Typed lists: album or song, and clean slate for local data.

-- Start from a clean state for lists in this environment.
TRUNCATE TABLE list_items CASCADE;
TRUNCATE TABLE lists CASCADE;

-- Ensure list_items has the expected columns (in case earlier migrations were skipped locally).
ALTER TABLE list_items
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add list type (album or song) to lists.
ALTER TABLE lists
  ADD COLUMN IF NOT EXISTS type TEXT CHECK (type IN ('album','song')) NOT NULL DEFAULT 'album';

-- Constrain list_items entity_type to valid values; app enforces matching list type.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'list_items_match_list_type'
  ) THEN
    ALTER TABLE list_items
      ADD CONSTRAINT list_items_match_list_type
      CHECK (entity_type IN ('album','song'));
  END IF;
END $$;

-- Helpful index for per-user, per-type queries.
CREATE INDEX IF NOT EXISTS idx_lists_user_type
ON lists(user_id, type);

