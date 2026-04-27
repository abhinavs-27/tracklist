-- 146_audit_optimizations_v13.sql
-- Optimizing comment retrieval for preferred and fallback schemas

CREATE INDEX IF NOT EXISTS idx_comments_review_id ON comments(review_id) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_log_id ON comments(log_id) WHERE log_id IS NOT NULL;
