import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api-response";
import { runPipelineHealthCheck } from "@/lib/jobs/pipeline-health";

/**
 * Dead-man's-switch + error watch. Delegates to `runPipelineHealthCheck()` (shared with the
 * SQS `PIPELINE_HEALTH` dispatch). Protected by CRON_SECRET. Scheduled via EventBridge → SQS
 * in production; this HTTP route stays available for manual/preview triggering.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return apiUnauthorized();
  }

  try {
    const result = await runPipelineHealthCheck();
    return apiOk(result);
  } catch (e) {
    return apiError(e instanceof Error ? e.message : "pipeline-health failed", 500);
  }
}
