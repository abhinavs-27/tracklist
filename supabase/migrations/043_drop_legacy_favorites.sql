-- 043_drop_legacy_favorites.sql
-- Cleanup: drop old "favorites" table from initial schema.
-- This table is no longer used; profile favorites and the "most favorited" leaderboard
-- both use user_favorite_albums instead.

DROP TABLE IF EXISTS favorites;

