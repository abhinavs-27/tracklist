import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, apiOk } from "@/lib/api-response";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";

/** Oldest cache rows first so every user rotates over time. */
const MAX_USERS_PER_RUN = 35;

/**
 * Daily taste identity refresh — recomputes `taste_identity_cache` from logs
 * (listening style, top artists, summary, etc.).
 *
 * GET /api/cron/taste-identity-refresh
 * Optional: Authorization: Bearer CRON_SECRET (when enabled in route)
 */
export async function GET() {
  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return apiUnauthorized();
  // }

  const admin = createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("taste_identity_cache")
    .select("user_id")
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(MAX_USERS_PER_RUN);

  if (error) {
    console.error("[cron taste-identity] query failed", error);
    console.log("[cron] taste-identity-refresh-complete", { success: false });
    return apiError("taste_identity_cache query failed", 500);
  }

  const userIds = (rows ?? []).map((r) => r.user_id as string);
  let processed = 0;
  let failures = 0;

  for (const userId of userIds) {
    try {
      await refreshTasteIdentityCacheForUser(userId);
      processed += 1;
    } catch (e) {
      console.error("[cron taste-identity] refresh failed", userId, e);
      failures += 1;
    }
  }

  console.log("[cron] taste-identity-refresh-complete", {
    success: true,
    attempted: userIds.length,
    processed,
    failures,
  });

  return apiOk({
    ok: true,
    attempted: userIds.length,
    processed,
    failures,
  });
}
