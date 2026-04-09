import { apiError, apiOk } from "@/lib/api-response";
import { runRepairLastfmAggregates } from "@/lib/cron/cron-runners";

/**
 * Backfills artist/album/genre listening aggregates for Last.fm logs that were counted
 * before async Spotify enrichment linked `songs` to catalog artists.
 * Production schedule: EventBridge → SQS.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const batch = Math.min(
      2000,
      Math.max(50, parseInt(searchParams.get("batch") ?? "500", 10) || 500),
    );

    const result = await runRepairLastfmAggregates(batch);
    return apiOk(result);
  } catch (e) {
    console.error("[cron repair-lastfm-aggregates]", e);
    return apiError(e instanceof Error ? e.message : "repair failed", 500);
  }
}
