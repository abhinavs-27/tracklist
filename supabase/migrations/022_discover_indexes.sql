-- Indexes to support discovery RPCs: time-bounded log scans and entity lookups.

-- Trending: filter logs by listened_at (24h), group by track_id.
CREATE INDEX IF NOT EXISTS idx_logs_listened_at_track_id ON logs(listened_at DESC, track_id);

-- Rising artists / hidden gems: logs joined to songs on track_id; existing idx_logs_track_id and idx_songs_artist are used.
-- No new index required; 022 adds only the composite above for trending.
