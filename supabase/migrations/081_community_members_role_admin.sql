-- Ensure `community_members.role` allows `admin` (migration 076 may be missing on some databases).
--
-- Order matters: drop the old CHECK first, then UPDATE owner→admin, then add the new CHECK.
-- Otherwise UPDATE ... SET role = 'admin' fails while the old constraint still only allows owner|member.

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'community_members'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE community_members DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

UPDATE community_members SET role = 'admin' WHERE role = 'owner';

ALTER TABLE community_members
  ADD CONSTRAINT community_members_role_check
  CHECK (role IN ('admin', 'member'));

COMMENT ON COLUMN community_members.role IS 'admin = can govern public communities; member = default. Private communities treat all members as admins at API layer.';
