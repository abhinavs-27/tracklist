-- Monthly taste snapshots per user.
-- Populated by the taste-snapshot Lambda cron (2nd of each month, previous month).
-- Backfilled historically by scripts/backfill-taste-snapshots.ts.

CREATE TABLE IF NOT EXISTS taste_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- ISO first day of the calendar month this snapshot covers (e.g. 2024-03-01).
  snapshot_month DATE        NOT NULL,
  top_artists   JSONB       NOT NULL DEFAULT '[]',  -- [{id,name,plays,imageUrl?}]
  top_genres    JSONB       NOT NULL DEFAULT '[]',  -- [{name,weight}]
  total_logs    INTEGER     NOT NULL DEFAULT 0,
  obscurity_score SMALLINT,                         -- 0-100, null if no popularity data
  diversity_score SMALLINT  NOT NULL DEFAULT 0,     -- distinct genre count, capped at 10
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS taste_snapshots_user_month
  ON taste_snapshots (user_id, snapshot_month DESC);

-- Quick lookup: "which users are missing a snapshot for a given month"
CREATE INDEX IF NOT EXISTS taste_snapshots_month
  ON taste_snapshots (snapshot_month);
