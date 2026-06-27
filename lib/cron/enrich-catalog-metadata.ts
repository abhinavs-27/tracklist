import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";
import { enrichTrackOrderForAlbum } from "@/lib/catalog/track-order/enrich";

export interface DateBatchCounts {
  processed: number;
  written: number;
  noMatch: number;
  errored: number;
}

export interface TrackOrderBatchCounts {
  processed: number;
  written: number;
  noSource: number;
  noMatch: number;
  errored: number;
}

interface DateRow {
  album_id: string;
  album_name: string;
  artist_name: string;
}

/** Deezer-fill release_date for up to `limit` recent null-date, Deezer-untried albums. */
export async function runDateEnrichmentBatch(
  supabase: SupabaseClient,
  limit: number,
): Promise<DateBatchCounts> {
  const counts: DateBatchCounts = { processed: 0, written: 0, noMatch: 0, errored: 0 };
  const { data, error } = await supabase.rpc("catalog_albums_needing_date", { p_limit: limit });
  if (error) throw new Error(`catalog_albums_needing_date: ${error.message}`);
  for (const row of (data ?? []) as DateRow[]) {
    counts.processed++;
    const result = await enrichAlbumDateFromDeezer(
      supabase,
      row.album_id,
      row.artist_name,
      row.album_name,
    );
    if (result === "written") counts.written++;
    else if (result === "no-match") counts.noMatch++;
    else if (result === "error") counts.errored++;
    // "skipped-has-date" is not expected here (selector filters to null dates); ignore if it occurs.
  }
  return counts;
}

/** Deezer-fill track_number for up to `limit` new/newly-grown albums (force re-check). */
export async function runTrackOrderEnrichmentBatch(
  supabase: SupabaseClient,
  limit: number,
): Promise<TrackOrderBatchCounts> {
  const counts: TrackOrderBatchCounts = { processed: 0, written: 0, noSource: 0, noMatch: 0, errored: 0 };
  const { data, error } = await supabase.rpc("catalog_albums_needing_track_order", { p_limit: limit });
  if (error) throw new Error(`catalog_albums_needing_track_order: ${error.message}`);
  for (const row of (data ?? []) as { album_id: string }[]) {
    counts.processed++;
    const result = await enrichTrackOrderForAlbum(supabase, row.album_id, { force: true });
    if (result === "written") counts.written++;
    else if (result === "no-source") counts.noSource++;
    else if (result === "no-match") counts.noMatch++;
    else if (result === "error") counts.errored++;
    // "skipped-checked" not expected (selector ensures null tracks); ignore if it occurs.
  }
  return counts;
}
