ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lastfm_import_status   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lastfm_import_progress JSONB   DEFAULT NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_lastfm_import_status_check
  CHECK (lastfm_import_status IS NULL OR lastfm_import_status IN ('pending','running','done','failed'));
