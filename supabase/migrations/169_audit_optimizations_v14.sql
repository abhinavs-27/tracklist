-- Audit optimizations v14
-- Focus on: social threads, rating distributions, and list items.

-- Optimized index for social thread participant inbox lookups and sorting.
-- Used by: listThreadsForUser
-- Query pattern: WHERE user_id = ? ORDER BY last_read_at DESC
CREATE INDEX IF NOT EXISTS idx_social_thread_participants_user_read
  ON social_thread_participants (user_id, last_read_at DESC);

-- Optimized index for entity rating distribution and average rating aggregation.
-- Used by: getEntityStats, getEntityStatsLive
-- Query pattern: WHERE entity_id = ? (for both album and song entity types)
CREATE INDEX IF NOT EXISTS idx_reviews_entity_rating
  ON reviews (entity_id, rating);

-- Covering index for list items to optimize retrieval within a list.
-- Used by: getList, getUserListsWithPreviews
-- Query pattern: WHERE list_id = ? ORDER BY position
CREATE INDEX IF NOT EXISTS idx_list_items_covering
  ON list_items (list_id, position, entity_id, entity_type);
