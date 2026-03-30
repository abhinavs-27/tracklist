-- Lightweight emoji reactions on feed items, notifications, etc.
-- Accessed via service role in API routes (RLS enabled, no policies for direct client access).

CREATE TABLE public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reactions_user_target_unique UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX reactions_target_lookup ON public.reactions (target_type, target_id);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
