-- Migration 152: Database Audit Optimizations v12
-- This migration adds indexes to support optimized query patterns identified during the June 2026 audit.

-- Support for social thread participant read status lookups in lib/social/threads.ts
CREATE INDEX IF NOT EXISTS idx_social_thread_participants_thread_id ON social_thread_participants(thread_id);

-- Support for social thread reply detail view (already exists as idx_social_replies_thread_created in migration 097, ensuring here)
-- idx_social_replies_thread_created ON social_thread_replies(thread_id, created_at)

-- Support for looking up social threads by reaction target (anchor_key often starts with activity: or notification:)
-- anchor_key is already UNIQUE which provides an index.

-- Support for efficient feed_events lookups with cursor (user_id IN (...) AND created_at < cursor)
-- idx_feed_events_user_created ON feed_events(user_id, created_at DESC) already exists in 065.
