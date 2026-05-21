import { apiError, apiOk } from "@/lib/api-response";
import { runArchiveOldLogs } from "@/lib/cron/cron-runners";

/**
 * Monthly: move logs older than 180 days to logs_archive.
 * Production schedule: EventBridge → SQS (1st of month, 03:00 UTC).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cutoffDays = Math.min(
      365,
      Math.max(30, parseInt(searchParams.get("cutoff_days") ?? "180", 10) || 180),
    );
    const result = await runArchiveOldLogs(cutoffDays);
    return apiOk(result);
  } catch (e) {
    console.error("[cron archive-old-logs]", e);
    return apiError(e instanceof Error ? e.message : "archive failed", 500);
  }
}
