-- Canonical catalog deduplication: discovery queries + merge options.
--
-- Why the big SQL merge kept "failing": merge_catalog_duplicate_entities runs as ONE
-- transaction; any uncaught error rolls back everything. Migrations 104–109 add fixes;
-- migration 110 adds list_* RPCs so you can merge **per pair** (each RPC = own txn)
-- from the Node script instead: `npm run merge-catalog` (service role in .env).
--
-- Prerequisites: 103 (repoint community_feed), 104+ (merge_catalog_*_pair), 110 (list_*).
--
-- ---------------------------------------------------------------------------
-- A) Diagnostics (after 109): duplicate *groups* + merge RPC exists
-- ---------------------------------------------------------------------------
-- SELECT * FROM merge_catalog_diag();

-- ---------------------------------------------------------------------------
-- B) Discovery: same duplicate definitions as merge logic (tracks use NULL album bucket)
-- ---------------------------------------------------------------------------
-- 1) Duplicate tracks
SELECT
  artist_id,
  name_normalized,
  album_id,
  COUNT(*) AS duplicate_count,
  array_agg(id ORDER BY created_at) AS track_ids
FROM tracks
GROUP BY artist_id, name_normalized, album_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 2) Duplicate artists
SELECT
  name_normalized,
  COUNT(*) AS duplicate_count,
  array_agg(id ORDER BY created_at) AS artist_ids
FROM artists
GROUP BY name_normalized
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 3) Duplicate albums
SELECT
  artist_id,
  name_normalized,
  COUNT(*) AS duplicate_count,
  array_agg(id ORDER BY created_at) AS album_ids
FROM albums
GROUP BY artist_id, name_normalized
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- ---------------------------------------------------------------------------
-- C) List (winner, loser) pairs — same as script uses (apply migration 110 first)
-- ---------------------------------------------------------------------------
-- SELECT * FROM merge_catalog_list_track_duplicate_pairs();
-- SELECT * FROM merge_catalog_list_album_duplicate_pairs();
-- SELECT * FROM merge_catalog_list_artist_duplicate_pairs();

-- ---------------------------------------------------------------------------
-- D) Batch merge (single transaction — optional; can still abort whole run on error)
-- ---------------------------------------------------------------------------
-- SELECT * FROM merge_catalog_duplicate_entities();

-- ---------------------------------------------------------------------------
-- E) Cron API (per-pair merges; each RPC = own transaction)
-- ---------------------------------------------------------------------------
--   GET /api/cron/merge-catalog-duplicates?maxRounds=5
--   GET /api/cron/merge-catalog-duplicates?dryRun=1
-- (Route is unauthenticated — local/trusted use only; add your own protection in prod.)
-- Local CLI (same logic): npm run merge-catalog
--
-- App code: lib/catalog/merge-canonical.ts (mergeCanonicalTracks / mergeCanonicalArtists).

-- Always back up production before merging.
