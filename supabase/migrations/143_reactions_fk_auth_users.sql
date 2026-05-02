-- Revert: reactions.user_id must reference public.users, not auth.users.
-- This app uses NextAuth; user IDs live in public.users, not Supabase auth.users.

ALTER TABLE public.reactions
  DROP CONSTRAINT IF EXISTS reactions_user_id_fkey;

ALTER TABLE public.reactions
  ADD CONSTRAINT reactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;
