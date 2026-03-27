-- Migration 087: Database audit optimizations and missing indexes
-- These indexes support common query patterns identified in the database audit.

-- Notifications: optimized for fetching recent notifications for a user, with support for filtering by read status.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created_at ON notifications(user_id, read, created_at DESC);

-- List Items: optimized for fetching items in a list in their intended order.
CREATE INDEX IF NOT EXISTS idx_list_items_list_position ON list_items(list_id, position);

-- User Favorite Albums: optimized for fetching a user's favorites in order.
CREATE INDEX IF NOT EXISTS idx_user_favorite_albums_user_position ON user_favorite_albums(user_id, position);

-- Community Members: optimized for existence checks and member lists.
CREATE INDEX IF NOT EXISTS idx_community_members_composite ON community_members(community_id, user_id);

-- Community Member Roles: optimized for fetching roles for specific members within a community.
CREATE INDEX IF NOT EXISTS idx_community_member_roles_composite ON community_member_roles(community_id, user_id);
