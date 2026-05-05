-- Cached blind spot artists per user. Computed lazily on first profile view,
-- then refreshed weekly by the REFRESH_BLIND_SPOTS cron job.
CREATE TABLE IF NOT EXISTS user_blind_spots (
  user_id     UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  artists     JSONB       NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
