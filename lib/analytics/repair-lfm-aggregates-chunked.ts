import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ChunkRow = {
  artist_rows: number;
  album_rows: number;
  genre_rows: number;
  next_cursor: string | null;
};

/**
 * Repair missing artist/album/genre aggregate rows by scanning the ingest table
 * in cursor-paginated chunks.
 *
 * The single-call variant (repair_lfm_aggregates_from_logs) scans all 434k
 * ingest rows per call and exceeds Supabase's 2-minute statement timeout.
 * This function calls repair_lfm_aggregates_chunk() in a loop, each processing
 * a fixed window of rows by PK order, advancing the cursor until done.
 */
export async function repairLfmAggregatesChunked(options?: {
  chunkSize?: number;
}): Promise<{
  artistRows: number;
  albumRows: number;
  genreRows: number;
  chunks: number;
  errors: number;
}> {
  const admin = createSupabaseAdminClient();
  const chunkSize = options?.chunkSize ?? 5000;

  let cursor: string | null = null;
  let totalArtist = 0;
  let totalAlbum = 0;
  let totalGenre = 0;
  let chunks = 0;
  let errors = 0;

  for (;;) {
    const params: Record<string, unknown> = { p_chunk_size: chunkSize };
    if (cursor !== null) params.p_after_log_id = cursor;

    const { data, error } = await admin.rpc("repair_lfm_aggregates_chunk", params);

    if (error) {
      console.error("[analytics] repair_lfm_aggregates_chunk failed", error);
      errors++;
      break;
    }

    const rows = (data ?? []) as ChunkRow[];
    const row = rows[0];
    if (!row) break;

    totalArtist += row.artist_rows ?? 0;
    totalAlbum += row.album_rows ?? 0;
    totalGenre += row.genre_rows ?? 0;
    chunks++;
    cursor = row.next_cursor;

    if (!cursor) break;
  }

  return { artistRows: totalArtist, albumRows: totalAlbum, genreRows: totalGenre, chunks, errors };
}
