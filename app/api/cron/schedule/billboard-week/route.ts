import { NextRequest } from "next/server";
import { apiError, apiOk, apiUnauthorized } from "@/lib/api-response";
import { enqueueBillboardWeekJobs } from "@/lib/jobs/enqueue-billboard-week";

/**
 * Fan-out weekly billboard jobs to SQS (`billboard-jobs`).
 * Call from EventBridge (HTTP) or manually with `Authorization: Bearer CRON_SECRET`.
 * Requires `BILLBOARD_JOBS_QUEUE_URL` and AWS credentials or env for `@aws-sdk/client-sqs`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiUnauthorized();
    }
  }

  try {
    const result = await enqueueBillboardWeekJobs();
    return apiOk({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] schedule/billboard-week", e);
    return apiError(
      e instanceof Error ? e.message : "enqueue billboard week failed",
      500,
    );
  }
}
