-- Bounds for community billboard backfill: earliest / latest listen among members.

CREATE OR REPLACE FUNCTION get_community_listen_time_bounds(p_community_id UUID)
RETURNS TABLE (
  min_listened_at TIMESTAMPTZ,
  max_listened_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    MIN(l.listened_at) AS min_listened_at,
    MAX(l.listened_at) AS max_listened_at
  FROM logs l
  INNER JOIN community_members cm
    ON cm.user_id = l.user_id
   AND cm.community_id = p_community_id;
$$;

COMMENT ON FUNCTION get_community_listen_time_bounds(UUID) IS
  'Min/max listened_at for any log by a member of the community; used for weekly chart backfill.';

GRANT EXECUTE ON FUNCTION get_community_listen_time_bounds(UUID) TO service_role;
