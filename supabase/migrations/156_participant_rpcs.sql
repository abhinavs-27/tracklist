-- supabase/migrations/156_participant_rpcs.sql
-- Replace Node-side paginated log scans with single SQL set operations.

-- Returns every user_id that has at least one listen in [p_start, p_end).
CREATE OR REPLACE FUNCTION get_user_ids_with_logs_in_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE(user_id UUID)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT l.user_id
  FROM logs l
  WHERE l.listened_at >= p_start
    AND l.listened_at <  p_end;
$$;

-- Returns every community_id whose members have at least one listen in [p_start, p_end).
CREATE OR REPLACE FUNCTION get_community_ids_with_logs_in_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE(community_id UUID)
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT cm.community_id
  FROM community_members cm
  JOIN logs l ON l.user_id = cm.user_id
  WHERE l.listened_at >= p_start
    AND l.listened_at <  p_end;
$$;

GRANT EXECUTE ON FUNCTION get_user_ids_with_logs_in_range(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION get_community_ids_with_logs_in_range(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
