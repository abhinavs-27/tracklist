import { NextRequest } from "next/server";
import { updateListeningAggregates } from "@/lib/analytics/updateListeningAggregates";
import { apiUnauthorized, apiOk, apiError } from "@/lib/api-response";

/**
 * Daily: roll pending logs into `user_listening_aggregates`.
 * Authorization: Bearer CRON_SECRET (optional in dev).
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
    const result = await updateListeningAggregates();
    return apiOk({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] listening-aggregates", e);
    return apiError("Aggregation failed", 500);
  }
}
