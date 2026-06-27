-- Selectors for the weekly catalog-enrichment cron (Deezer-only).
-- Newest-first so the cron always spends its budget on recent content.

-- Albums missing a release_date that Deezer hasn't been tried on yet.
CREATE OR REPLACE FUNCTION catalog_albums_needing_date(p_limit int)
RETURNS TABLE(album_id uuid, album_name text, artist_name text)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.name, ar.name
  FROM albums a
  JOIN artists ar ON ar.id = a.artist_id
  WHERE a.release_date IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM album_external_ids x
      WHERE x.album_id = a.id AND x.source = 'deezer'
    )
  ORDER BY a.cached_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0);
$$;

-- Albums with a null-track-number track that are new or have gained a track
-- since the last track-order check.
CREATE OR REPLACE FUNCTION catalog_albums_needing_track_order(p_limit int)
RETURNS TABLE(album_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT a.id
  FROM albums a
  WHERE EXISTS (
    SELECT 1 FROM tracks t
    WHERE t.album_id = a.id
      AND t.track_number IS NULL
      AND (a.track_order_checked_at IS NULL OR t.created_at > a.track_order_checked_at)
  )
  ORDER BY a.cached_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 0);
$$;
