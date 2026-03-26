-- Community governance: `owner` → `admin`; only `admin` | `member` going forward.

UPDATE community_members SET role = 'admin' WHERE role = 'owner';

DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'community_members'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%role%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE community_members DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE community_members
  ADD CONSTRAINT community_members_role_check
  CHECK (role IN ('admin', 'member'));

COMMENT ON COLUMN community_members.role IS 'admin = can govern public communities; member = default. Private communities treat all members as admins at API layer.';
