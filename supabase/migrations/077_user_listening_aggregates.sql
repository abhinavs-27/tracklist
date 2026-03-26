-- Precomputed per-user listening rankings by artist / album / track / genre and time bucket.

CREATE TABLE IF NOT EXISTS user_listening_aggregate_ingest (
  log_id UUID PRIMARY KEY REFERENCES logs(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ula_ingest_processed ON user_listening_aggregate_ingest(processed_at DESC);

CREATE TABLE IF NOT EXISTS user_listening_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'album', 'track', 'genre')),
  entity_id TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  week_start DATE,
  month DATE,
  year INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ula_bucket_one CHECK (
    (week_start IS NOT NULL AND month IS NULL AND year IS NULL)
    OR (week_start IS NULL AND month IS NOT NULL AND year IS NULL)
    OR (week_start IS NULL AND month IS NULL AND year IS NOT NULL)
  )
);

-- One row per (user, entity, bucket). NULLS NOT DISTINCT: week OR month OR year is set; others are null.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_listening_aggregates_bucket
  ON user_listening_aggregates (user_id, entity_type, entity_id, week_start, month, year)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_ula_user_type_week
  ON user_listening_aggregates(user_id, entity_type, week_start)
  WHERE week_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ula_user_type_month
  ON user_listening_aggregates(user_id, entity_type, month)
  WHERE month IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ula_user_type_year
  ON user_listening_aggregates(user_id, entity_type, year)
  WHERE year IS NOT NULL;

ALTER TABLE user_listening_aggregates DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_listening_aggregate_ingest DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE user_listening_aggregates IS 'Rankings: one row per user+entity+bucket. week_start=Monday UTC; month=first of month; year=calendar year.';

CREATE OR REPLACE FUNCTION get_pending_logs_for_aggregates(p_limit INT DEFAULT 2000)
RETURNS SETOF logs
LANGUAGE sql
STABLE
AS $$
  SELECT l.*
  FROM logs l
  LEFT JOIN user_listening_aggregate_ingest i ON i.log_id = l.id
  WHERE i.log_id IS NULL
  ORDER BY l.listened_at ASC
  LIMIT GREATEST(1, LEAST(p_limit, 10000));
$$;

-- Atomic increment for cron ingestion (conflicts on uq_user_listening_aggregates_bucket)
CREATE OR REPLACE FUNCTION increment_user_listening_aggregate(
  p_user_id UUID,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_week_start DATE,
  p_month DATE,
  p_year INT,
  p_delta INT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;
  INSERT INTO user_listening_aggregates (
    user_id, entity_type, entity_id, count, week_start, month, year
  ) VALUES (
    p_user_id, p_entity_type, p_entity_id, p_delta, p_week_start, p_month, p_year
  )
  ON CONFLICT (user_id, entity_type, entity_id, week_start, month, year)
  DO UPDATE SET
    count = user_listening_aggregates.count + EXCLUDED.count,
    updated_at = now();
END;
$$;
