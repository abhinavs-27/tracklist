-- Migration 100: Additional social and feed optimizations
-- This index supports common social query patterns and efficient feed generation for followed users.

-- follows: Optimize "recent follows by a specific follower" and follower listing ordered by date.
CREATE INDEX IF NOT EXISTS idx_follows_follower_created_at ON follows(follower_id, created_at DESC);
