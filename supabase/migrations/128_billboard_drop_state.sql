-- Weekly Billboard "drop" UX: modal + banner + optional weekly email dedupe.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS billboard_drop_ack_week TEXT,
  ADD COLUMN IF NOT EXISTS billboard_drop_dismissed_week TEXT,
  ADD COLUMN IF NOT EXISTS billboard_weekly_email_last_week TEXT;

COMMENT ON COLUMN public.users.billboard_drop_ack_week IS
  'ISO week_start (UTC) of the latest Weekly Billboard drop the user acknowledged (modal finished, banner → chart, or viewed latest chart).';

COMMENT ON COLUMN public.users.billboard_drop_dismissed_week IS
  'ISO week_start when the user closed the drop modal without finishing; home shows a reminder banner until they open the chart.';

COMMENT ON COLUMN public.users.billboard_weekly_email_last_week IS
  'ISO week_start of the last Billboard summary email sent to this user (dedupe).';
