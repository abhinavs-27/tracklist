import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { syncLastfmScrobblesForUser } from "@/lib/lastfm/sync-user-scrobbles";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";

/**
 * POST — pull new Last.fm scrobbles for the signed-in user (same logic as the daily cron).
 * Call after saving `lastfm_username` so users do not wait until the next scheduled run.
 */
export const POST = withHandler(async (request: NextRequest, { user: me }) => {
  const supabase = await createSupabaseServerClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("lastfm_username")
    .eq("id", me!.id)
    .maybeSingle();

  if (error) return apiInternalError(error);

  const username = user?.lastfm_username?.trim();
  if (!username) {
    return apiBadRequest("Save a Last.fm username first");
  }

  const admin = createSupabaseAdminClient();
  const result = await syncLastfmScrobblesForUser(admin, me!.id, username);

  if (result.fetchFailed) {
    console.warn("[lastfm] manual-sync-failed", {
      userId: me!.id,
      error: result.fetchError,
    });
    return apiOk({
      ok: true,
      imported: 0,
      lastfm_last_synced_at: null,
      warning: result.fetchError ?? "Last.fm request failed",
      warningCode: result.fetchErrorCode ?? null,
    });
  }

  console.log("[lastfm] manual-sync-complete", {
    userId: me!.id,
    imported: result.imported,
  });

  return apiOk({
    ok: true,
    imported: result.imported,
    lastfm_last_synced_at: result.lastSyncedAt,
  });
}, { requireAuth: true });
