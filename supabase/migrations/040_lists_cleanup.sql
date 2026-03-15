-- Cleanup legacy list_items columns from initial schema.
-- The app now uses entity_type/entity_id/position/added_at from migration 020/039.
-- This migration removes old NOT NULL columns that are no longer used and
-- currently cause insert failures (e.g. null spotify_id constraint violations).

ALTER TABLE list_items
  DROP COLUMN IF EXISTS spotify_id,
  DROP COLUMN IF EXISTS type;

