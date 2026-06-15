import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Back-fill missing artist/album/genre aggregate rows for logs that were
 * processed before Spotify enrichment populated tracks.artist_id / album_id.
 *
 * Run this after `spotify-enrich:local` completes so that the enriched track
 * data is available to join against.
 */
export async function repairLfmAggregatesFromLogs(options?: {
  userId?: string;
}): Promise<{ artistRows: number; albumRows: number; genreRows: number; errors: number }> {
  const admin = createSupabaseAdminClient();

  const params: Record<string, unknown> = {};
  if (options?.userId) params.p_user_id = options.userId;

  const { data, error } = await admin.rpc("repair_lfm_aggregates_from_logs", params);

  if (error) {
    console.error("[analytics] repair_lfm_aggregates_from_logs failed", error);
    return { artistRows: 0, albumRows: 0, genreRows: 0, errors: 1 };
  }

  const row = (data ?? []) as { artist_rows: number; album_rows: number; genre_rows: number }[];
  return {
    artistRows: row[0]?.artist_rows ?? 0,
    albumRows: row[0]?.album_rows ?? 0,
    genreRows: row[0]?.genre_rows ?? 0,
    errors: 0,
  };
}
