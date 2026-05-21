-- supabase/migrations/161_job_runs.sql
-- Stores one row per background job execution for operational visibility.

CREATE TABLE IF NOT EXISTS job_runs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     TEXT        NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms  INT,
  status       TEXT        NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  fast_path    BOOLEAN,
  items_ok     INT,
  items_failed INT,
  meta         JSONB
);

-- Primary access pattern: recent runs for a specific job
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
  ON job_runs(job_name, started_at DESC);

-- Secondary: all recent runs across jobs
CREATE INDEX IF NOT EXISTS idx_job_runs_started
  ON job_runs(started_at DESC);

ALTER TABLE job_runs DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON job_runs TO service_role;
