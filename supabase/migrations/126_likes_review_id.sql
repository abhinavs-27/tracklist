-- Align `public.likes` with migration 012 (review_id). Some environments never applied 012
-- or drifted from the log_id schema; PostgREST then errors: PGRST204 review_id not found.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'likes'
      AND column_name = 'review_id'
  ) THEN
    DROP TABLE IF EXISTS public.likes CASCADE;
    CREATE TABLE public.likes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, review_id)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_review ON public.likes(review_id);
    CREATE INDEX IF NOT EXISTS idx_likes_user ON public.likes(user_id);
    ALTER TABLE public.likes DISABLE ROW LEVEL SECURITY;
  END IF;
END $$;
