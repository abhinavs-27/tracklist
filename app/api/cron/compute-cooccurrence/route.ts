import { apiError, apiOk } from "@/lib/api-response";
import { runComputeCooccurrence } from "@/lib/cron/cron-runners";

/**
 * Cron: recompute media co-occurrence (songs + albums) for recommendations.
 * Production schedule: EventBridge → SQS.
 */
export async function GET() {
  try {
    const result = await runComputeCooccurrence();
    return apiOk(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "compute-cooccurrence cron failed";
    console.log("[cron] compute-cooccurrence-complete", { success: false });
    return apiError(message, 500);
  }
}
