-- Migration 128: Additional performance indexes from query audit.
-- Focus on user profile paths, lists, and community memberships.

-- 1. Lists: Fetching a user's lists ordered by creation date.
CREATE INDEX IF NOT EXISTS idx_lists_user_created_at ON lists(user_id, created_at DESC);

-- 2. Community Members: membership lookups by user and role.
-- Complements idx_community_members_composite (community_id, user_id).
CREATE INDEX IF NOT EXISTS idx_community_members_user_role ON community_members(user_id, role);

-- 3. Logs: Ensure composite index for track-scoped user history.
CREATE INDEX IF NOT EXISTS idx_logs_track_user_listened ON logs(track_id, user_id, listened_at DESC);
