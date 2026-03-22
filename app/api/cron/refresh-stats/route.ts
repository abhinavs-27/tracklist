import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiUnauthorized, apiError, apiOk } from "@/lib/api-response";
import { isProd } from "@/lib/env";

/**
 * Cron: refresh precomputed entity stats (album_stats, track_stats) and discovery MVs.
 * Call with: Authorization: Bearer <CRON_SECRET>
 * Schedule periodically (e.g. every 10–15 min) to keep stats and discover cache fresh.
 */
export async function GET(request: NextRequest) {
  // if (!isProd()) {
  //   return apiOk({ ok: false, message: "cron disabled outside prod" });
  // }

  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return apiUnauthorized();
  // }

  const supabase = createSupabaseAdminClient();

  const { error: statsError } = await supabase.rpc("refresh_entity_stats");
  if (statsError) {
    console.error("[cron] refresh_entity_stats RPC failed", statsError);
    console.log("[cron] refresh-stats-complete", { success: false });
    return apiError(statsError.message, 500);
  }

  const { error: favError } = await supabase.rpc(
    "sync_favorite_counts_from_user_favorite_albums",
  );
  if (favError) {
    console.error(
      "[cron] sync_favorite_counts_from_user_favorite_albums failed",
      favError,
    );
    console.log("[cron] refresh-stats-complete", { success: false });
    return apiError(favError.message, 500);
  }

  const { error: discoverError } = await supabase.rpc("refresh_discover_mvs");
  if (discoverError) {
    console.warn(
      "[cron] refresh_discover_mvs skipped (apply migration 038 for discover cache):",
      discoverError.message,
    );
    // Non-fatal if the RPC doesn't exist yet
  }

  console.log("[cron] refresh-stats-complete", { success: true });
  return apiOk({ ok: true });
}
