import { withHandler } from "@/lib/api-handler";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncLastfmScrobblesForUser } from "@/lib/lastfm/sync-user-scrobbles";
import { apiError, apiOk, apiUnauthorized } from "@/lib/api-response";
import { isProd } from "@/lib/env";
import { NextRequest } from "next/server";

const MAX_USERS_PER_RUN = 50;

/**
 * Daily Last.fm scrobble sync for users with a saved username.
 * Authorization: Bearer <CRON_SECRET> (prod only)
 */
export const GET = withHandler(async (request: NextRequest) => {
  if (isProd()) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return apiUnauthorized();
    }
  }

  const supabase = createSupabaseAdminClient();

  const { data: rawUsers, error } = await supabase
    .from("users")
    .select("id, lastfm_username")
    .not("lastfm_username", "is", null)
    .neq("lastfm_username", "")
    .order("lastfm_last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_USERS_PER_RUN);

  if (error) {
    console.error("[cron lastfm] users query failed", error);
    console.log("[cron] lastfm-sync-complete", { success: false });
    return apiError("users query failed", 500);
  }

  const users = (rawUsers ?? []).filter((u) => u.lastfm_username?.trim());

  let processed = 0;
  let totalInserted = 0;
  let failures = 0;

  for (const u of users) {
    const username = u.lastfm_username!.trim();
    processed += 1;
    try {
      const result = await syncLastfmScrobblesForUser(supabase, u.id, username);
      if (result.fetchFailed) {
        console.warn("[cron lastfm] skipped user", {
          userId: u.id,
          username,
          error: result.fetchError,
          code: result.fetchErrorCode,
        });
        failures += 1;
        continue;
      }
      totalInserted += result.imported;
    } catch (e) {
      console.error("[cron lastfm] user sync failed", u.id, e);
      failures += 1;
    }
  }

  console.log("[cron] lastfm-sync-complete", {
    success: true,
    processed,
    inserted: totalInserted,
    failures,
  });

  return apiOk({
    ok: true,
    processed,
    inserted: totalInserted,
    failures,
  });
});
