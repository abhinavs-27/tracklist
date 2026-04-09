import { NextRequest } from "next/server";
import { apiUnauthorized, apiOk, apiError } from "@/lib/api-response";
import { runListeningAggregates } from "@/lib/cron/cron-runners";

/**
 * Daily: roll pending logs into `user_listening_aggregates`.
 * Production schedule: EventBridge → SQS.
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
    const result = await runListeningAggregates();
    return apiOk(result);
  } catch (e) {
    console.error("[cron] listening-aggregates", e);
    return apiError("Aggregation failed", 500);
  }
}
