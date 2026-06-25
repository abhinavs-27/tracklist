-- Add 'deezer' as a valid external metadata source.
-- NOTE: A new enum value cannot be used in the same transaction that adds it,
-- so this migration only adds the value and must run before any code/migration
-- that inserts 'deezer' rows.
ALTER TYPE music_external_source ADD VALUE IF NOT EXISTS 'deezer';
