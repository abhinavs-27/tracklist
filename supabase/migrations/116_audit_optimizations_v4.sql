-- Migration: Audit Optimizations v4
-- Description: Additional indexes for community and social activity queries.

-- Optimized for community membership lists and sorting by join date.
CREATE INDEX IF NOT EXISTS idx_community_members_community_id_created_at
ON community_members(community_id, created_at);

-- Optimized for fetching followers of a specific user, ordered by most recent follow.
CREATE INDEX IF NOT EXISTS idx_follows_following_id_created_at
ON follows(following_id, created_at DESC);

-- Update get_user_communities_with_meta to support pagination.
CREATE OR REPLACE FUNCTION public.get_user_communities_with_meta(
  p_user_id uuid,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
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
    ORDER BY cm.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
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
