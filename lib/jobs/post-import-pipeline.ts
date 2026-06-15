import "server-only";

import { updateListeningAggregates } from "@/lib/analytics/updateListeningAggregates";
import {
  repairMissingArtistAggregates,
  repairOrphanedArtistAggregates,
} from "@/lib/analytics/repair-artist-aggregates";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";

const LOG = "[post-import-pipeline]";

export type PostImportPipelineOptions = {
  /**
   * `inline`  — run everything in-process (local dev + BullMQ worker).
   * `enqueue` — send a single POST_IMPORT_PIPELINE SQS message (future full-AWS mode).
   * Defaults to the POST_IMPORT_PIPELINE_MODE env var, falling back to `inline`.
   */
  mode?: "inline" | "enqueue";
  /**
   * Max updateListeningAggregates iterations in inline mode.
   * Each iteration processes up to 10k logs. Default: 20 (up to 200k logs).
   * Remaining logs drain via the daily cron.
   */
  maxAggregateIterations?: number;
};

/** Aggregate drain is a global operation — guard against concurrent in-process runs. */
let _draining = false;

/**
 * Run the full stats pipeline for a user after their Last.fm import completes.
 *
 * inline mode (default):
 *   1. Drain pending aggregate logs (global queue, up to maxAggregateIterations × 10k logs)
 *   2. Repair missing artist-level aggregate rows for this user
 *   3. Refresh this user's taste identity cache
 *   4. Bump Spotify enrichment for new entities (200 songs / 100 artists)
 *
 * enqueue mode:
 *   Sends a single POST_IMPORT_PIPELINE SQS message with the userId.
 *   The SQS cron worker handles the full pipeline inline on the other side.
 *   Set POST_IMPORT_PIPELINE_MODE=enqueue in production when AWS compute
 *   can handle the load without local intervention.
 */
export async function runPostImportPipelineForUser(
  userId: string,
  options?: PostImportPipelineOptions,
): Promise<void> {
  const mode =
    options?.mode ??
    (process.env.POST_IMPORT_PIPELINE_MODE === "enqueue" ? "enqueue" : "inline");

  console.log(LOG, "start", { userId, mode });

  if (mode === "enqueue") {
    await runEnqueueMode(userId);
    console.log(LOG, "enqueue done", { userId });
    return;
  }

  await runInlineMode(userId, options?.maxAggregateIterations ?? 20);
  console.log(LOG, "inline done", { userId });
}

async function runEnqueueMode(userId: string): Promise<void> {
  const { sendCronJobMessage } = await import("@/lib/jobs/enqueue-cron-message");
  // Single message carries the userId — the SQS cron worker handles the full pipeline.
  await sendCronJobMessage({ type: "POST_IMPORT_PIPELINE", userId });
}

async function runInlineMode(
  userId: string,
  maxIterations: number,
): Promise<void> {
  // ── 1. Drain pending aggregate logs ─────────────────────────────────────────
  // The aggregate queue is global (one watermark for all users). Guard against
  // two concurrent import jobs both trying to drain at the same time.
  if (_draining) {
    // The running drain is global and will process this user's logs too.
    // The daily cron handles any logs inserted after it finishes.
    console.warn(LOG, "aggregate drain already in progress — this user's logs will be caught by the running drain or daily cron", { userId });
  } else {
    _draining = true;
    try {
      let totalAggregated = 0;
      for (let i = 0; i < maxIterations; i++) {
        const result = await updateListeningAggregates({ batchSize: 10000 });
        totalAggregated += result.processed;
        if (result.processed === 0) break;
        if (result.errors > 0) {
          console.warn(LOG, "aggregate drain error — stopping", { round: i + 1, errors: result.errors });
          break;
        }
      }
      console.log(LOG, "aggregate drain done", { userId, totalAggregated });
    } finally {
      _draining = false;
    }
  }

  // ── 2. Repair missing artist rows for this user ──────────────────────────────
  const [missing, orphaned] = await Promise.allSettled([
    repairMissingArtistAggregates({ userId }),
    repairOrphanedArtistAggregates({ userId }),
  ]);
  if (missing.status === "fulfilled") {
    console.log(LOG, "repair missing artist aggregates", { userId, inserted: missing.value.inserted });
  } else {
    console.warn(LOG, "repair missing artist aggregates failed", { userId, reason: missing.reason });
  }
  if (orphaned.status === "fulfilled") {
    console.log(LOG, "repair orphaned artist aggregates", { userId, merged: orphaned.value.merged });
  } else {
    console.warn(LOG, "repair orphaned artist aggregates failed", { userId, reason: orphaned.reason });
  }

  // ── 3. Refresh taste identity for this user ──────────────────────────────────
  try {
    await refreshTasteIdentityCacheForUser(userId);
    console.log(LOG, "taste identity refreshed", { userId });
  } catch (e) {
    console.warn(LOG, "taste identity refresh failed (non-fatal)", {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── 4. Bump Spotify enrichment for newly created entities ───────────────────
  try {
    const { runSpotifyEnrichmentRetry } = await import("@/lib/cron/cron-runners");
    await runSpotifyEnrichmentRetry(200, 100);
    console.log(LOG, "spotify enrichment retry queued", { userId });
  } catch (e) {
    console.warn(LOG, "spotify enrichment retry failed (non-fatal)", {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
