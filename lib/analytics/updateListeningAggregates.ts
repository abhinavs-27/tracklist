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

  // Filter out rows already processed by write-time inline aggregates so the
  // drain doesn't double-count them. Advance watermark past the full scanned
  // window even when all rows are filtered (prevents watermark getting stuck).
  // Chunk at 200 UUIDs to avoid PostgREST ~8KB URL limit (~200 UUIDs per request).
  const FILTER_CHUNK = 200;
  const ingestedIds = new Set<string>();
  for (let i = 0; i < rows.length; i += FILTER_CHUNK) {
    const chunk = rows.slice(i, i + FILTER_CHUNK);
    const { data: chunkData, error: filterErr } = await admin
      .from("user_listening_aggregate_ingest")
      .select("log_id")
      .in("log_id", chunk.map((r) => r.id));
    if (filterErr) {
      // Fail safe: abort the drain rather than risk double-counting aggregates.
      console.error("[analytics] ingest filter lookup failed", filterErr);
      log("ingest_filter_failed", { message: filterErr.message });
      return { processed: 0, errors: 1 };
    }
    for (const r of chunkData ?? []) ingestedIds.add((r as { log_id: string }).log_id);
  }
  const rowsToProcess = rows.filter((r) => !ingestedIds.has(r.id));

  log("fetched_pending_logs", { scanned: rows.length, toProcess: rowsToProcess.length });

  if (!rowsToProcess.length) {
    // All logs in this window were inline-processed; advance watermark past them.
    log("all_inline_processed", { scanned: rows.length });
    const lastScanned = rows[rows.length - 1];
    if (lastScanned) {
      const { error: wmErr } = await admin.rpc("advance_aggregate_ingest_watermark", {
        p_listened_at: lastScanned.listened_at,
        p_log_id: lastScanned.id,
        p_created_at: lastScanned.created_at,
      });
      if (wmErr) {
        console.error("[analytics] advance_aggregate_ingest_watermark (inline skip)", wmErr);
        log("watermark_advance_failed", { message: wmErr.message });
      } else {
        log("watermark_advanced", { created_at: lastScanned.created_at, log_id: lastScanned.id });
      }
    }
    return { processed: 0, errors: 0 };
  }

  const ctx = await loadAggregateCatalogForLogs(admin, rowsToProcess);

  log("loaded_related_rows", {
    distinctTracks: [
      ...new Set(rowsToProcess.map((r) => r.track_id).filter(Boolean) as string[]),
    ].length,
    distinctAlbums: ctx.albumById.size,
    distinctArtists: ctx.artistById.size,
  });

  const maps = accumulateListeningAggregateDeltas(rowsToProcess, ctx, {
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

  const ingested: { log_id: string }[] = rowsToProcess.map((r) => ({ log_id: r.id }));
  log("ingest_insert_start", { logRows: ingested.length });
  const INGEST_CHUNK = 200;
  for (let i = 0; i < ingested.length; i += INGEST_CHUNK) {
    const chunk = ingested.slice(i, i + INGEST_CHUNK);
    const { error: insErr } = await admin
      .from("user_listening_aggregate_ingest")
      .upsert(chunk, { onConflict: "log_id", ignoreDuplicates: true });
    if (insErr) {
      console.error("[analytics] ingest insert failed", insErr);
      log("ingest_insert_failed", { message: insErr.message });
      return { processed: 0, errors: 1 };
    }
  }

  // Advance the watermark cursor to the last row in the full scanned window
  // (not just rowsToProcess) so the next invocation uses a fast range scan
  // instead of a full anti-join, and doesn't re-scan inline-skipped logs.
  const lastRow = rows[rows.length - 1];
  if (lastRow) {
    const { error: wmErr } = await admin.rpc(
      "advance_aggregate_ingest_watermark",
      {
        p_listened_at: lastRow.listened_at,
        p_log_id: lastRow.id,
        p_created_at: lastRow.created_at,
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
        created_at: lastRow.created_at,
        log_id: lastRow.id,
      });
    }
  }

  log("done", {
    processed: rowsToProcess.length,
    errors: 0,
    pendingLogs: rows.length,
  });

  return { processed: rowsToProcess.length, errors: 0 };
}
