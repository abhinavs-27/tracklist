import { NextRequest } from "next/server";
import { computeCommunityWeeklyChartsForAll } from "@/lib/charts/compute-community-weekly-charts-all";
import { computeWeeklyChartsForAllUsers } from "@/lib/charts/compute-weekly-charts-all";
import { apiUnauthorized, apiOk, apiError } from "@/lib/api-response";

/**
 * Weekly (schedule: Sunday 00:00 UTC): compute user Weekly Billboard rows, then
 * community billboards (same week window, aggregated member plays).
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
    const users = await computeWeeklyChartsForAllUsers();
    const communities = await computeCommunityWeeklyChartsForAll();
    return apiOk({
      ok: true,
      users,
      communities,
    });
  } catch (e) {
    console.error("[cron] weekly-charts", e);
    return apiError("Weekly charts failed", 500);
  }
}
