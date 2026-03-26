# Database Performance Optimizations

This document summarizes the database performance optimizations implemented across the codebase, focusing on high-volume tables like `logs`, `reviews`, and `follows`.

## Recommended Indexes

The following indexes have been added in migration `071_query_performance_optimizations.sql` to support core query patterns:

### `logs` table
- **`idx_logs_track_id_listened_at`**: `(track_id, listened_at DESC)`
  - Optimizes track history and listener queries (used on track detail pages).
- **`idx_logs_album_id_listened_at`**: `(album_id, listened_at DESC)`
  - Optimizes album listening history (used on album detail pages and recent activity).

### `reviews` table
- **`idx_reviews_entity_id_type_created`**: `(entity_id, entity_type, created_at DESC)`
  - Optimizes fetching reviews for a specific album or song with chronological sorting.

## RPC Optimizations

### `get_track_stats_batch(p_track_ids TEXT[])`
Replaces multiple client-side aggregation queries with a single database-side call. It returns:
- `track_id`
- `listen_count`
- `review_count`
- `avg_rating` (rounded to 1 decimal place)

This RPC is used by `getTrackStatsForTrackIds` in both the Next.js and Express backend services to efficiently show stats for track lists (e.g., in a search result or on an album page).

## Query Constraints

- **Follower safety limits**: Queries fetching a user's full "following" list for feed generation (e.g., in `getActivityFeed`) are capped at **500** users. This prevents performance degradation for accounts with extreme follow counts.
- **Explicit field selection**: All Supabase queries now use explicit `.select('field1, field2')` to minimize data transfer from the database.
- **Null handling**: Recent activity queries from `logs` now include `.not('listened_at', 'is', null)` to ensure optimal use of composite indexes.
