-- Per-category push preferences. Absent row = defaults (all on except charts).
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  social boolean NOT NULL DEFAULT true,
  recommendations boolean NOT NULL DEFAULT true,
  community boolean NOT NULL DEFAULT true,
  charts boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
