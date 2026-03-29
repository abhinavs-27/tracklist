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

Based on the audit of query patterns in `lib/queries.ts` and `backend/services/`, the following additional indexes are recommended:

| Table | Index Columns | Rationale |
|-------|---------------|-----------|
| `logs` | `(track_id, user_id, listened_at DESC)` | Optimized for "friends who listened to this track" and per-user track activity. |
| `songs` | `(album_id)` | Optimized for fetching all songs in an album (common in aggregation). |
| `songs` | `(artist_id)` | Optimized for fetching all songs by an artist (common in artist-scoped queries). |
| `albums` | `(artist_id)` | Optimized for fetching all albums by an artist. |
| `reviews` | `(entity_id, created_at DESC)` | Optimized for fetching latest reviews for an entity when type is already filtered. |

## Recommendations for Future Queries

1. **Always use explicit `.select()`**: Even if all columns are needed, explicit lists prevent over-fetching if the schema grows.
2. **Prefer Database RPCs for Aggregation**: Use the existing RPCs for counts and stats instead of fetching raw rows.
3. **Use the `fetchUserMap` Helper**: When enriching data with user profiles, use this shared utility to deduplicate requests.
4. **Enforce Limits on `IN` clauses**: When using `.in()`, ensure the array size is capped (e.g., 500) to avoid Postgres performance penalties or parameter limits.
