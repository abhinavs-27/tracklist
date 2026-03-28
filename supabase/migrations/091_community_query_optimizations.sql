-- Migration 091: Community query optimizations and missing indexes
-- These indexes support common query patterns for community discovery and user-specific community lists.

-- Community Members: optimize for fetching a user's communities ordered by join date.
CREATE INDEX IF NOT EXISTS idx_community_members_user_joined_at ON community_members(user_id, joined_at DESC);

-- Communities: optimize for discovery (newest communities first).
CREATE INDEX IF NOT EXISTS idx_communities_created_at ON communities(created_at DESC);

-- Logs: composite index for artist-level history queries identified in getReviewsForArtist/getTopTracksForArtist.
CREATE INDEX IF NOT EXISTS idx_logs_artist_id_listened_at ON logs(artist_id, listened_at DESC);

-- Comments: optimize for review/log-specific comment retrieval.
CREATE INDEX IF NOT EXISTS idx_comments_review_id_created_at ON comments(review_id, created_at DESC) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_log_id_created_at ON comments(log_id, created_at DESC) WHERE log_id IS NOT NULL;
