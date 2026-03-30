-- Per-participant read state for inbox unread indicators.
ALTER TABLE public.social_thread_participants
ADD COLUMN IF NOT EXISTS last_read_at timestamptz;

COMMENT ON COLUMN public.social_thread_participants.last_read_at IS
  'When this participant last opened the thread; compared to social_threads.last_activity_at for unread.';
