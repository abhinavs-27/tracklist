-- Migration 151: Database Audit Optimizations v11
-- This migration adds indexes to support optimized query patterns identified in the May 2026 audit.

-- Support for entity-agnostic review lookups (e.g. all reviews for an artist's tracks and albums)
-- Used in getReviewsForArtist in lib/queries.ts
CREATE INDEX IF NOT EXISTS idx_reviews_entity_id_created_at ON reviews(entity_id, created_at DESC);

-- Support for ordered achievement fetching
-- Used in getUserAchievements in lib/queries.ts
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_earned_at ON user_achievements(user_id, earned_at DESC);

-- Support for track lookups by name within an artist or album
-- Used in findTrackIdByArtistAlbumAndName in lib/catalog/entity-resolution.ts
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id_name_normalized ON tracks(artist_id, name_normalized);
CREATE INDEX IF NOT EXISTS idx_tracks_album_id_name_normalized ON tracks(album_id, name_normalized);

-- Support for deduplication checks in feed event generation
-- Although UNIQUE (user_id, dedupe_key) exists, an explicit index can sometimes be preferred by the optimizer
-- and ensures we have the coverage we expect for the existsDedupe query.
-- (Already covered by unique constraint, omitting to avoid redundancy)

-- Support for follower fetching with limit
-- Used in getListenLogsForArtist in lib/queries.ts
-- Existing idx_follows_follower_id_created_at covers (follower_id, created_at DESC)
