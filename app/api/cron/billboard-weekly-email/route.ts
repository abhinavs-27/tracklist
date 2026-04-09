import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api-response";
import { runBillboardWeeklyEmail } from "@/lib/cron/cron-runners";

/**
 * After user + community weekly charts, send digest emails.
 * Production schedule: EventBridge → SQS (after billboard jobs complete).
 * Requires `RESEND_API_KEY` and `RESEND_FROM`.
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
    const result = await runBillboardWeeklyEmail();
    return apiOk(result);
  } catch (e) {
    console.error("[cron] billboard-weekly-email", e);
    return apiError("Billboard email cron failed", 500);
  }
}
