import { apiError, apiOk } from "@/lib/api-response";
import { runLastfmSync } from "@/lib/cron/cron-runners";

/**
 * Daily Last.fm scrobble sync for users with a saved username.
 * Production schedule: EventBridge → SQS.
 */
export async function GET() {
  try {
    const result = await runLastfmSync();
    return apiOk(result);
  } catch (e) {
    console.error("[cron lastfm] users query failed", e);
    return apiError("lastfm-sync failed", 500);
  }
}
