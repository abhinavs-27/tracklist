-- Persist taste comparisons (viewer ran taste match vs another user) for social inbox.
-- Written from GET /api/taste-match via service role; RLS on, no direct client policies.

CREATE TABLE public.taste_comparison_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX taste_comparison_log_viewer_created
  ON public.taste_comparison_log (viewer_user_id, created_at DESC);

ALTER TABLE public.taste_comparison_log ENABLE ROW LEVEL SECURITY;
