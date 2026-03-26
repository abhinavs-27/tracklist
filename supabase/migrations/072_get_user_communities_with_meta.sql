-- Single round-trip for /communities list: memberships + community rows + per-community member counts.
-- Replaces N+1 count queries + separate membership + communities selects.

CREATE OR REPLACE FUNCTION public.get_user_communities_with_meta(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_private boolean,
  created_by uuid,
  created_at timestamptz,
  my_role text,
  member_count bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH memberships AS (
    SELECT cm.community_id, cm.role
    FROM community_members cm
    WHERE cm.user_id = p_user_id
  ),
  counts AS (
    SELECT m.community_id, COUNT(*)::bigint AS n
    FROM community_members m
    INNER JOIN memberships ms ON ms.community_id = m.community_id
    GROUP BY m.community_id
  )
  SELECT
    c.id,
    c.name,
    c.description,
    c.is_private,
    c.created_by,
    c.created_at,
    ms.role AS my_role,
    COALESCE(ct.n, 0::bigint) AS member_count
  FROM memberships ms
  INNER JOIN communities c ON c.id = ms.community_id
  LEFT JOIN counts ct ON ct.community_id = c.id
  ORDER BY c.created_at DESC;
$$;
