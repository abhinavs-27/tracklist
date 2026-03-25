-- Allow declining invites (re-invite updates row back to pending in app).

ALTER TABLE community_invites
  DROP CONSTRAINT IF EXISTS community_invites_status_check;

ALTER TABLE community_invites
  ADD CONSTRAINT community_invites_status_check
  CHECK (status IN ('pending', 'accepted', 'declined'));
