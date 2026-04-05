import { NextRequest } from "next/server";
import { computeWeeklyChartsForAllUsers } from "@/lib/charts/compute-weekly-charts-all";
import { apiUnauthorized, apiOk, apiError } from "@/lib/api-response";

/**
 * Weekly (schedule: Sun 05:00 UTC): compute **user** Weekly Billboard rows only.
 * Runs before `/api/cron/weekly-charts-communities`. Authorization: Bearer CRON_SECRET.
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
    const users = await computeWeeklyChartsForAllUsers();
    return apiOk({
      ok: true,
      users,
    });
  } catch (e) {
    console.error("[cron] weekly-charts-users", e);
    return apiError("User weekly charts failed", 500);
  }
}
