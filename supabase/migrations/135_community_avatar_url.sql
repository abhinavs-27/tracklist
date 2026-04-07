-- Community profile picture URL (S3/CDN); users.avatar_url already exists.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.communities.avatar_url IS
  'Public HTTPS URL for community profile image (JPEG), typically S3/CloudFront.';

-- Extend community list RPC to include avatar for nav/cards.
-- Return type changed: must drop; CREATE OR REPLACE cannot alter OUT row shape.
DROP FUNCTION IF EXISTS public.get_user_communities_with_meta(uuid, integer, integer);

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
  avatar_url text,
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
    c.avatar_url,
    ms.role AS my_role,
    COALESCE(ct.n, 0::bigint) AS member_count
  FROM memberships ms
  INNER JOIN communities c ON c.id = ms.community_id
  LEFT JOIN counts ct ON ct.community_id = c.id
  ORDER BY c.created_at DESC;
$$;
