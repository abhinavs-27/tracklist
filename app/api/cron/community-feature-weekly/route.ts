import { computeAllCommunitiesWeekly } from "@/lib/community/compute-community-weekly";
import { apiOk } from "@/lib/api-response";

/**
 * Weekly community jobs: taste pairs, member stats, weekly summary, roles.
 * GET /api/cron/community-feature-weekly?limit=40
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "80", 10) || 80),
  );
  const { processed, failures } = await computeAllCommunitiesWeekly(limit);
  return apiOk({ ok: true, processed, failures });
}
