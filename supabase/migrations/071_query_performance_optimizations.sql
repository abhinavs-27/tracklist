-- Query performance optimizations: composite indexes and a batch track stats RPC.

-- 1. Create indexes for performance
-- Logs: Optimize lookups by track and album, plus chronological sorting
CREATE INDEX IF NOT EXISTS idx_logs_track_id_listened_at ON logs(track_id, listened_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_album_id_listened_at ON logs(album_id, listened_at DESC);

-- Reviews: Optimize entity-based lookups with chronological sorting
CREATE INDEX IF NOT EXISTS idx_reviews_entity_id_type_created ON reviews(entity_id, entity_type, created_at DESC);

-- 2. Create the get_track_stats_batch RPC for efficient multi-track data aggregation
-- This replaces multiple manual client-side counts/sums for multiple track IDs.
CREATE OR REPLACE FUNCTION get_track_stats_batch(p_track_ids TEXT[])
RETURNS TABLE (
  track_id TEXT,
  listen_count BIGINT,
  review_count BIGINT,
  avg_rating NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH track_list AS (
    SELECT unnest(p_track_ids) AS tid
  ),
  track_logs AS (
    SELECT logs.track_id AS tid, count(*) AS lcount
    FROM logs
    JOIN track_list ON logs.track_id = track_list.tid
    GROUP BY logs.track_id
  ),
  track_reviews AS (
    SELECT reviews.entity_id AS tid, count(*) AS rcount, avg(rating) AS arating
    FROM reviews
    JOIN track_list ON reviews.entity_id = track_list.tid
    WHERE reviews.entity_type = 'song'
    GROUP BY reviews.entity_id
  )
  SELECT
    tl.tid AS track_id,
    COALESCE(tlgs.lcount, 0) AS listen_count,
    COALESCE(trvs.rcount, 0) AS review_count,
    COALESCE(trvs.arating, 0)::NUMERIC AS avg_rating
  FROM track_list tl
  LEFT JOIN track_logs tlgs ON tl.tid = tlgs.tid
  LEFT JOIN track_reviews trvs ON tl.tid = trvs.tid;
END;
$$;
