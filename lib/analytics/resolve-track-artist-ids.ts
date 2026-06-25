import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function resolveTrackArtistIdsByName(options?: {
  userId?: string;
}): Promise<{ tracksUpdated: number; errors: number }> {
  const admin = createSupabaseAdminClient();

  const params: Record<string, unknown> = {};
  if (options?.userId) params.p_user_id = options.userId;

  const { data, error } = await admin.rpc(
    "resolve_track_artist_ids_from_name",
    params,
  );

  if (error) {
    console.error("[analytics] resolve_track_artist_ids_from_name failed", error);
    return { tracksUpdated: 0, errors: 1 };
  }

  const row = (data ?? []) as { tracks_updated: number }[];
  return {
    tracksUpdated: row[0]?.tracks_updated ?? 0,
    errors: 0,
  };
}
