import { apiError, apiOk } from "@/lib/api-response";
import { runRefreshStats } from "@/lib/cron/cron-runners";

/**
 * Cron: refresh entity_stats, favorite counts, discovery MVs, then snapshot API cache tables
 * (`leaderboard_cache`, `trending_cache`, `community_rankings_cache`).
 * Production schedule: EventBridge → SQS (see `infra/aws/`). Legacy Vercel cron removed.
 */
export async function GET() {
  try {
    const result = await runRefreshStats();
    return apiOk(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "refresh-stats failed";
    return apiError(msg, 500);
  }
}
