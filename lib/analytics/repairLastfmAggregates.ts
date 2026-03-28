import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  accumulateListeningAggregateDeltas,
  applyListeningAggregateDeltaMaps,
  loadAggregateCatalogForLogs,
  type AggregateLogRow,
} from "@/lib/analytics/listening-aggregate-deltas";

/**
 * Last.fm logs are ingested into aggregates before async Spotify enrichment fills `songs.artist_id`.
 * Those listens only contributed `track` deltas (lfm:* id), not artist/album/genre.
 * This job adds the missing artist/album/genre increments once the song row is enriched.
 * Idempotent per log via `user_listening_aggregate_lfm_repair`.
 */
export async function repairLastfmListeningAggregates(options?: {
  batchSize?: number;
}): Promise<{ repaired: number; errors: number; skippedEmpty: boolean }> {
  const admin = createSupabaseAdminClient();
  const batchSize = Math.min(
    2000,
    Math.max(50, options?.batchSize ?? 500),
  );
  const t0 = Date.now();
  const log = (phase: string, detail?: Record<string, unknown>) => {
    console.log("[analytics] repair-lastfm-aggregates", phase, {
      ...detail,
      ms: Date.now() - t0,
    });
  };

  log("start", { batchSize });

  const { data: logs, error: logErr } = await admin.rpc(
    "get_logs_for_lfm_aggregate_repair",
    { p_limit: batchSize },
  );

  if (logErr) {
    console.error("[analytics] get_logs_for_lfm_aggregate_repair", logErr);
    log("fetch_failed", { message: logErr.message });
    return { repaired: 0, errors: 1, skippedEmpty: false };
  }

  const rows = (logs ?? []) as AggregateLogRow[];

  if (!rows.length) {
    log("done", { pending: 0 });
    return { repaired: 0, errors: 0, skippedEmpty: true };
  }

  log("fetched_logs", { count: rows.length });

  const ctx = await loadAggregateCatalogForLogs(admin, rows);

  const maps = accumulateListeningAggregateDeltas(rows, ctx, {
    includeTrackBumps: false,
  });

  const { errors: applyErr } = await applyListeningAggregateDeltaMaps(
    admin,
    maps,
    log,
  );
  if (applyErr) {
    return { repaired: 0, errors: applyErr, skippedEmpty: false };
  }

  const repairRows = rows.map((r) => ({ log_id: r.id }));
  const { error: insErr } = await admin
    .from("user_listening_aggregate_lfm_repair")
    .insert(repairRows);

  if (insErr) {
    console.error("[analytics] lfm_repair insert failed", insErr);
    log("repair_marker_failed", { message: insErr.message });
    return { repaired: 0, errors: 1, skippedEmpty: false };
  }

  log("done", { repaired: rows.length });

  return { repaired: rows.length, errors: 0, skippedEmpty: false };
}
