# Database Audit Report - May 2024

This document summarizes the database query audit and subsequent optimizations performed across the repository.

## Overview

The audit focused on identifying:
- Redundant column fetching (e.g., `select('*')` or fetching columns used in `WHERE` clauses).
- Unbounded queries that could lead to performance degradation as the dataset grows.
- Missing indexes for common query patterns.

## Optimizations

### 1. Explicit Field Selection
Across the Next.js `lib/` directory, `app/api/` routes, and the Express `backend/` services/routes, all Supabase queries were updated to use explicit field selection. Redundant columns (like `user_id` when fetching for a specific user) were removed from the `.select()` calls.

**Key files updated:**
- `lib/queries.ts`
- `lib/spotify-cache.ts`
- `lib/community/get-community-member-stats.ts`
- `backend/services/*.ts`
- `app/api/**/*.ts`
- `app/profile/[id]/page.tsx`

### 2. Pagination and Limits
Queries that previously lacked constraints or relied on large in-memory sorts were updated to use database-side pagination (`range`, `limit`, `offset`).

**Key Improvements:**
- `getCommunityMemberStatsWithRoles`: Now supports `limit` and `offset`, with a default limit of 100.
- `getCommunityFeedMerged`: Added a hard limit (1000) for initial member ID retrieval.
- Follow lookups in `activityFeedService.ts` and `queries.ts`: Added a limit of 500 to prevent oversized `IN` clauses.

### 3. New Database Indexes
The following indexes were added via migration `087_audit_optimizations.sql` to support high-traffic query patterns:

| Table | Index Columns | Rationale |
|-------|---------------|-----------|
| `notifications` | `(user_id, created_at DESC)` | Optimized for fetching recent notifications. |
| `notifications` | `(user_id, read, created_at DESC)` | Optimized for unread notification count/list. |
| `list_items` | `(list_id, position)` | Optimized for fetching ordered items in a list. |
| `user_favorite_albums` | `(user_id, position)` | Optimized for fetching ordered user favorites. |
| `community_members` | `(community_id, user_id)` | Optimized for membership checks and community lists. |
| `community_member_roles` | `(community_id, user_id)` | Optimized for fetching roles for community members. |

## New Recommended Indexes

Based on the audit of query patterns in `lib/queries.ts` and `backend/services/`, the following additional indexes were identified and implemented:

| Table | Index Columns | Migration | Rationale |
|-------|---------------|-----------|-----------|
| `logs` | `(track_id, user_id, listened_at DESC)` | `091` | Optimized for "friends who listened to this track" and per-user track activity. |
| `songs` | `(album_id)` | `091` | Optimized for fetching all songs in an album (common in aggregation). |
| `songs` | `(artist_id)` | `091` | Optimized for fetching all songs by an artist (common in artist-scoped queries). |
| `albums` | `(artist_id)` | `091` | Optimized for fetching all albums by an artist. |
| `reviews` | `(entity_id, created_at DESC)` | `091` | Optimized for fetching latest reviews for an entity when type is already filtered. |
| `follows` | `(follower_id, created_at DESC)` | `100` | Optimized for "recent follows by a specific follower" and follower listing ordered by date. |
| `community_members` | `(community_id, created_at)` | `116` | Optimized for community member lists and join date sorting. |
| `follows` | `(following_id, created_at DESC)` | `116` | Optimized for "recent followers of a user" and follower listing ordered by date. |
| `community_taste_match` | `(user_id, community_id, similarity_score DESC)` | `125` | Optimized for viewer-member taste match lookups and roster sorting. |
| `feed_events` | `(user_id, type, created_at DESC)` | `125` | Optimized for fetching specific story types for a user's feed. |
| `lists` | `(user_id, created_at DESC)` | `129` | Optimized for fetching lists by user ordered by creation date. |
| `list_items` | `(list_id, position)` | `129` | Optimized for fetching ordered items within a list. |
| `reviews` | `(user_id, created_at DESC)` | `129` | Optimized for fetching recent reviews for a user. |
| `follows` | `(follower_id, following_id)` | `129` | Optimized for "is following" check. |
| `community_member_stats` | `(community_id, listen_count_7d DESC)` | `129` | Optimized for active-member count and roster sorting. |
| `feed_events` | `(user_id, created_at DESC)` | `131` | Optimized for personal and following feed lookups. |
| `community_weekly_charts` | `(community_id, chart_type, week_start DESC)` | `131` | Optimized for fetching latest community charts. |
| `community_members` | `(community_id, role, created_at)` | `131` | Optimized for community roster retrieval and sorting. |
| `reviews` | `(entity_type, entity_id, created_at DESC)` | `141` | Optimized for fetching latest reviews for an entity. |
| `logs` | `(track_id, listened_at DESC)` | `141` | Optimized for track activity history. |
| `users` | `(username gin_trgm_ops)` | `141` | Optimized for fuzzy user search via ILIKE. |
| `users` | `(created_at, id)` | `141` | Optimized for directory listing of users. |
| `follows` | `(following_id, created_at DESC)` | `141` | Optimized for follower retrieval. |
| `follows` | `(follower_id, created_at DESC)` | `141` | Optimized for following retrieval. |
| `albums` | `(release_date DESC, id)` | `141` | Optimized for leaderboard release date filtering. |
| `track_stats` | `(listen_count DESC)` | `141` | Optimized for track charts. |
| `album_stats` | `(listen_count DESC)` | `141` | Optimized for album charts. |
| `community_members` | `(user_id, community_id)` | `141` | Optimized for membership checks in RPCs. |
| `list_items` | `(entity_type, entity_id)` | `144` | Optimized for finding lists containing a specific item. |
| `reviews` | `(user_id, entity_type, created_at DESC)` | `144` | Optimized for profile filtering of reviews by type. |
| `logs` | `(user_id, track_id, listened_at DESC)` | `144` | Optimized for "your history with this track". |
| `reviews` | `(entity_type, entity_id, user_id)` | `144` | Optimized for album favorited by users RPC. |
| `user_achievements` | `(user_id, earned_at DESC)` | `144` | Optimized for user achievement lookups ordered by time. |

## Recommendations for Future Queries

1. **Always use explicit `.select()`**: Even if all columns are needed, explicit lists prevent over-fetching if the schema grows.
2. **Prefer Database RPCs for Aggregation**: Use the existing RPCs for counts and stats instead of fetching raw rows.
3. **Use the `fetchUserMap` Helper**: When enriching data with user profiles, use this shared utility to deduplicate requests.
4. **Enforce Limits on `IN` clauses**: When using `.in()`, ensure the array size is capped (e.g., 500) to avoid Postgres performance penalties or parameter limits.
