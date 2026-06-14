import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiBadRequest } from "@/lib/api-response";
import { runRefreshBlindSpots } from "@/lib/cron/cron-runners";
import { refreshBlindSpots } from "@/lib/profile/taste-blind-spots";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidUuid } from "@/lib/validation";

/**
 * Blind spots refresh — recomputes `user_blind_spots` from Last.fm similar artists.
 * Pass `?userId=<uuid>` to refresh a single user immediately.
 * Pass `?force=true` to refresh all users regardless of computed_at staleness.
 * Production schedule: EventBridge → SQS (REFRESH_BLIND_SPOTS).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiUnauthorized();
    }
  }

  const userId = request.nextUrl.searchParams.get("userId");
  const force = request.nextUrl.searchParams.get("force") === "true";

  if (userId) {
    if (!isValidUuid(userId)) return apiBadRequest("invalid userId");
    const result = await refreshBlindSpots(userId);
    return apiOk({ ok: true, refreshed: userId, artistCount: result.artists.length });
  }

  if (force) {
    const admin = createSupabaseAdminClient();
    const { data: rows } = await admin
      .from("user_listening_aggregates")
      .select("user_id")
      .eq("entity_type", "artist");
    const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string).filter(Boolean))];
    let processed = 0, skipped = 0, errors = 0;
    for (const uid of userIds) {
      try {
        const result = await refreshBlindSpots(uid);
        if (result.hasData) processed++;
        else skipped++;
      } catch {
        errors++;
      }
    }
    return apiOk({ ok: true, processed, skipped, errors });
  }

  const result = await runRefreshBlindSpots();
  return apiOk(result);
}
