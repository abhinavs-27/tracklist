-- Migration 142: Database Audit Optimizations v10
-- This migration adds indexes identified during the database query audit.

-- Optimize comment retrieval for reviews and listen logs
CREATE INDEX IF NOT EXISTS idx_comments_review_id ON comments(review_id) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_log_id ON comments(log_id) WHERE log_id IS NOT NULL;

-- Optimize feed event deduplication
CREATE INDEX IF NOT EXISTS idx_feed_events_user_id_dedupe_key ON feed_events(user_id, dedupe_key);
