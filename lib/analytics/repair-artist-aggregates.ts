import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Fix logs processed before Spotify enrichment set tracks.artist_id (album plays counted, artist plays dropped). */
export async function repairMissingArtistAggregates(options?: {
  limit?: number;
  userId?: string;
}): Promise<{ inserted: number; errors: number }> {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(100000, Math.max(100, options?.limit ?? 50000));

  const params: Record<string, unknown> = { p_limit: limit };
  if (options?.userId) params.p_user_id = options.userId;

  const { data, error } = await admin.rpc("repair_missing_artist_aggregates", params);

  if (error) {
    console.error("[analytics] repair_missing_artist_aggregates failed", error);
    return { inserted: 0, errors: 1 };
  }

  const rows = (data ?? []) as { inserted_rows: number }[];
  return { inserted: rows[0]?.inserted_rows ?? 0, errors: 0 };
}

/** Fix orphaned artist aggregate rows left by artist merges that hit a unique-constraint conflict. */
export async function repairOrphanedArtistAggregates(options?: {
  userId?: string;
}): Promise<{ merged: number; errors: number }> {
  const admin = createSupabaseAdminClient();

  const params: Record<string, unknown> = {};
  if (options?.userId) params.p_user_id = options.userId;

  const { data, error } = await admin.rpc("repair_orphaned_artist_aggregates", params);

  if (error) {
    console.error("[analytics] repair_orphaned_artist_aggregates failed", error);
    return { merged: 0, errors: 1 };
  }

  const rows = (data ?? []) as { merged_rows: number }[];
  return { merged: rows[0]?.merged_rows ?? 0, errors: 0 };
}
