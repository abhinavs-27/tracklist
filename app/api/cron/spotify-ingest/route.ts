import { withHandler } from "@/lib/api-handler";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ingestRecentPlaysForUser } from "@/lib/logs-ingest";
import { isSpotifyIntegrationEnabled } from "@/lib/spotify-integration-enabled";
import { apiError, apiOk } from "@/lib/api-response";

const BATCH_SIZE = 50;
const MAX_USERS_PER_RUN = 500;

export const GET = withHandler(async () => {

  if (!isSpotifyIntegrationEnabled()) {
    console.log("[cron] spotify-ingest-complete", {
      success: true,
      skipped: true,
      reason: "spotify_integration_disabled",
    });
    return apiOk({
      ok: true,
      integrationDisabled: true,
      processed: 0,
      inserted: 0,
      skipped: 0,
    });
  }

  const supabase = createSupabaseAdminClient();

  const { data: tokens, error } = await supabase
    .from("spotify_tokens")
    .select("user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_USERS_PER_RUN);

  if (error) {
    console.error("[cron] spotify_tokens query failed", error);
    console.log("[cron] spotify-ingest-complete", { success: false });
    return apiError("spotify_tokens query failed", 500);
  }

  const userIds = [...new Set((tokens ?? []).map((t) => t.user_id as string))];

  let processed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);

    for (const userId of batch) {
      try {
        const r = await ingestRecentPlaysForUser(userId);
        totalInserted += r.inserted;
        totalSkipped += r.skipped;
      } catch (e) {
        console.error("[cron] ingest failed for user", userId, e);
      }
    }

    processed += batch.length;
    if (processed >= MAX_USERS_PER_RUN) break;
  }

  console.log(
    "[cron] spotify-ingest-complete",
    { success: true, processed, totalInserted, totalSkipped },
  );

  return apiOk({
    ok: true,
    processed,
    inserted: totalInserted,
    skipped: totalSkipped,
  });
});
