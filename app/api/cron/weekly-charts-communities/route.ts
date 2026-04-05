import { NextRequest } from "next/server";
import { computeCommunityWeeklyChartsForAll } from "@/lib/charts/compute-community-weekly-charts-all";
import { apiUnauthorized, apiOk, apiError } from "@/lib/api-response";

/**
 * Weekly (schedule: Sun 06:00 UTC): compute **community** weekly billboards only.
 * Runs after user charts (`/api/cron/weekly-charts-users`). Authorization: Bearer CRON_SECRET.
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
    const communities = await computeCommunityWeeklyChartsForAll();
    return apiOk({
      ok: true,
      communities,
    });
  } catch (e) {
    console.error("[cron] weekly-charts-communities", e);
    return apiError("Community weekly charts failed", 500);
  }
}
