export type BatchRunStatus = "ok" | "skipped" | "error";

/**
 * Status for a job that processes N items where each may fail independently
 * (e.g. lastfm_sync fetching many users' scrobbles).
 *
 * - Nothing processed → "skipped": the job ran but had no work. Counts as healthy.
 * - Every processed item failed → "error": a real, total failure worth alerting on.
 * - Otherwise → "ok": partial per-item failures are recorded via items_failed, not
 *   promoted to a run failure. A couple of dead/private Last.fm accounts must not
 *   stamp an otherwise-successful run (hundreds of imports) as error — that produced
 *   daily false "error" + "no successful run on record" alerts.
 */
export function classifyBatchRunStatus(processed: number, failures: number): BatchRunStatus {
  if (processed === 0) return "skipped";
  if (failures >= processed) return "error";
  return "ok";
}
