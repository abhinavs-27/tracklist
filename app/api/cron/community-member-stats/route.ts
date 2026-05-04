import { NextRequest } from "next/server";
import { computeAllCommunitiesWeekly } from "@/lib/community/compute-community-weekly";
import { apiUnauthorized, apiOk, apiError } from "@/lib/api-response";

/**
 * Refreshes community_member_stats (listen_count_7d, streaks, roles) for all communities.
 * Powers the community leaderboard and member stats strip on the community page.
 * Run weekly alongside the billboard cron (or more frequently if desired).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return apiUnauthorized();
  }

  try {
    const result = await computeAllCommunitiesWeekly();
    return apiOk({ ok: true, ...result });
  } catch (e) {
    console.error("[cron] community-member-stats", e);
    return apiError("Community member stats refresh failed", 500);
  }
}
