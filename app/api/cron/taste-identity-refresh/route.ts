import { apiOk } from "@/lib/api-response";
import { runTasteIdentityRefresh } from "@/lib/cron/cron-runners";

/**
 * Daily taste identity refresh — recomputes `taste_identity_cache` from logs.
 * Production schedule: EventBridge → SQS.
 */
export async function GET() {
  const result = await runTasteIdentityRefresh();
  return apiOk(result);
}

