-- Single round-trip for home feed legacy sources: reviews + follows + listen sessions.
-- Matches three separate RPC calls (017 + 138) but one Postgres→client hop.
-- Application falls back to parallel RPCs if this function is missing.

CREATE OR REPLACE FUNCTION get_home_feed_legacy_bundle(
  p_follower_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'reviews',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(r))
        FROM get_feed_reviews(p_follower_id, p_cursor, p_limit) AS r
      ),
      '[]'::jsonb
    ),
    'follows',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(f))
        FROM get_feed_follows(p_follower_id, p_cursor, p_limit) AS f
      ),
      '[]'::jsonb
    ),
    'listen_sessions',
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(l))
        FROM get_feed_listen_sessions(p_follower_id, p_cursor, p_limit) AS l
      ),
      '[]'::jsonb
    )
  );
$$;

COMMENT ON FUNCTION get_home_feed_legacy_bundle(UUID, TIMESTAMPTZ, INT) IS
  'Returns JSON with reviews, follows, listen_sessions arrays (same rows as get_feed_* RPCs).';
