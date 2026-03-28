-- Idempotent repair: Last.fm logs processed into aggregates before Spotify enrichment
-- only got track-level counts; once songs.artist_id is set, a cron adds artist/album/genre deltas.

CREATE TABLE IF NOT EXISTS user_listening_aggregate_lfm_repair (
  log_id UUID PRIMARY KEY REFERENCES logs(id) ON DELETE CASCADE,
  repaired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfm_repair_at ON user_listening_aggregate_lfm_repair(repaired_at DESC);

ALTER TABLE user_listening_aggregate_lfm_repair DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_listening_aggregate_lfm_repair IS
  'Logs for which missing artist/album/genre aggregate deltas were applied after LFM→Spotify enrichment.';

CREATE OR REPLACE FUNCTION get_logs_for_lfm_aggregate_repair(p_limit INT DEFAULT 500)
RETURNS SETOF logs
LANGUAGE sql
STABLE
AS $$
  SELECT l.*
  FROM logs l
  INNER JOIN user_listening_aggregate_ingest i ON i.log_id = l.id
  LEFT JOIN user_listening_aggregate_lfm_repair r ON r.log_id = l.id
  WHERE l.track_id LIKE 'lfm:%'
    AND r.log_id IS NULL
    AND EXISTS (
      SELECT 1 FROM songs s
      WHERE s.id = l.track_id
        AND s.artist_id IS NOT NULL
        AND btrim(s.artist_id) <> ''
    )
  ORDER BY l.listened_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
$$;
