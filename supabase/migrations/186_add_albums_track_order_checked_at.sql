-- Album-level marker: when track ordering was last attempted for this album
-- (set on success AND clean no-source/no-match) so backfill resumes skip it.
ALTER TABLE albums ADD COLUMN IF NOT EXISTS track_order_checked_at timestamptz;
