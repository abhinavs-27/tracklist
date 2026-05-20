import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  accumulateListeningAggregateDeltas,
  applyListeningAggregateDeltaMaps,
  loadAggregateCatalogForLogs,
  type AggregateLogRow,
} from "@/lib/analytics/listening-aggregate-deltas";

/**
 * Processes logs not yet in `user_listening_aggregate_ingest`, batches increments, applies via RPC.
 * Safe to run frequently; each log is ingested at most once.
 */
export async function updateListeningAggregates(options?: {
  batchSize?: number;
}): Promise<{ processed: number; errors: number }> {
  const admin = createSupabaseAdminClient();
  const batchSize = Math.min(
    10000,
    Math.max(100, options?.batchSize ?? 2000),
  );
  const t0 = Date.now();
  const log = (phase: string, detail?: Record<string, unknown>) => {
    console.log("[analytics] listening-aggregates", phase, {
      ...detail,
      ms: Date.now() - t0,
    });
  };

  log("start", { batchSize });

  const { data: logs, error: logErr } = await admin.rpc(
    "get_pending_logs_for_aggregates",
    { p_limit: batchSize },
  );

  if (logErr) {
    console.error("[analytics] get_pending_logs_for_aggregates", logErr);
    log("fetch_logs_failed", { message: logErr.message });
    return { processed: 0, errors: 1 };
  }

  const rows = (logs ?? []) as AggregateLogRow[];

  if (!rows.length) {
    log("done", { pendingLogs: 0, processed: 0 });
    return { processed: 0, errors: 0 };
  }

  log("fetched_pending_logs", { count: rows.length });

  const ctx = await loadAggregateCatalogForLogs(admin, rows);

  log("loaded_related_rows", {
    distinctTracks: [
      ...new Set(rows.map((r) => r.track_id).filter(Boolean) as string[]),
    ].length,
    distinctAlbums: ctx.albumById.size,
    distinctArtists: ctx.artistById.size,
  });

  const maps = accumulateListeningAggregateDeltas(rows, ctx, {
    includeTrackBumps: true,
  });

  const { errors: applyErr } = await applyListeningAggregateDeltaMaps(
    admin,
    maps,
    log,
  );
  if (applyErr) {
    return { processed: 0, errors: applyErr };
  }

  const ingested: { log_id: string }[] = rows.map((r) => ({ log_id: r.id }));
  log("ingest_insert_start", { logRows: ingested.length });
  const { error: insErr } = await admin
    .from("user_listening_aggregate_ingest")
    .insert(ingested);

  if (insErr) {
    console.error("[analytics] ingest insert failed", insErr);
    log("ingest_insert_failed", { message: insErr.message });
    return { processed: 0, errors: 1 };
  }

  // Advance the watermark cursor to the last processed row so the next
  // invocation uses a fast range scan instead of a full anti-join.
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const { error: wmErr } = await admin.rpc(
      "advance_aggregate_ingest_watermark",
      {
        p_listened_at: lastRow.listened_at,
        p_log_id: lastRow.id,
      },
    );
    if (wmErr) {
      // Non-fatal: the ingest rows were already inserted, so aggregates are
      // correct. The watermark will just not advance, causing a redundant
      // anti-join on the next run (old behaviour), not data loss.
      console.error("[analytics] advance_aggregate_ingest_watermark", wmErr);
      log("watermark_advance_failed", { message: wmErr.message });
    } else {
      log("watermark_advanced", {
        listened_at: lastRow.listened_at,
        log_id: lastRow.id,
      });
    }
  }

  log("done", {
    processed: rows.length,
    errors: 0,
    pendingLogs: rows.length,
  });

  return { processed: rows.length, errors: 0 };
}
