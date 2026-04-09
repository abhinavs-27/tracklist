import { apiOk } from "@/lib/api-response";
import { runCommunityFeatureWeekly } from "@/lib/cron/cron-runners";

/**
 * Weekly community jobs: taste pairs, member stats, weekly summary, roles.
 * Production schedule: EventBridge → SQS.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "80", 10) || 80),
  );
  const result = await runCommunityFeatureWeekly(limit);
  return apiOk(result);
}
