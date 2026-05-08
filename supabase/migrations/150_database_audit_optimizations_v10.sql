-- Migration 150: Database Audit Optimizations v10
-- Focus: Optimizing comment lookups and joins

-- Supports joining user metadata for comments (profile cards in comment sections)
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);

-- Optimized for fetching ordered comments for a review
CREATE INDEX IF NOT EXISTS idx_comments_review_id_created_at ON public.comments(review_id, created_at ASC);

-- Efficiently supports legacy schema fallback for comments targeting log_id
CREATE INDEX IF NOT EXISTS idx_comments_log_id_partial ON public.comments(log_id) WHERE log_id IS NOT NULL;
