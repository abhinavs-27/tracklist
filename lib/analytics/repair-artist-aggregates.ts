import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function repairMissingArtistAggregates(options?: {
  limit?: number;
  userId?: string;
}): Promise<{ inserted: number; errors: number }> {
  const admin = createSupabaseAdminClient();
  const limit = Math.min(100000, Math.max(100, options?.limit ?? 50000));

  const params: Record<string, unknown> = { p_limit: limit };
  if (options?.userId) params.p_user_id = options.userId;

  const { data, error } = await admin.rpc(
    "repair_missing_artist_aggregates",
    params,
  );

  if (error) {
    console.error("[analytics] repair_missing_artist_aggregates failed", error);
    return { inserted: 0, errors: 1 };
  }

  const rows = (data ?? []) as { inserted_rows: number }[];
  const inserted = rows[0]?.inserted_rows ?? 0;
  return { inserted, errors: 0 };
}
