-- Persist full listening report output so shared / saved views never recompute from live logs.

ALTER TABLE saved_reports
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB;

COMMENT ON COLUMN saved_reports.snapshot_json IS
  'Frozen ListeningReportSnapshotV1 (tracks/artists/albums/genres + totals) at save time.';
