import { NextRequest } from "next/server";
import { apiUnauthorized, apiOk, apiError, apiBadRequest } from "@/lib/api-response";
import { runRepairArtistAggregates } from "@/lib/cron/cron-runners";
import { repairMissingArtistAggregates } from "@/lib/analytics/repair-artist-aggregates";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { isValidUuid } from "@/lib/validation";

/**
 * Repair missing artist rows in user_listening_aggregates.
 *
 * ?userId=<uuid>  — repairs only that user (no row-limit issue) then immediately
 *                   refreshes their taste_identity_cache. Use this when a specific
 *                   user's top artists are wrong after the general repair ran.
 *
 * No ?userId      — global repair pass (all users, up to 100k album rows).
 *                   Does NOT trigger taste-identity-refresh; run that separately.
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

  if (userId) {
    if (!isValidUuid(userId)) return apiBadRequest("invalid userId");

    try {
      const repair = await repairMissingArtistAggregates({ userId });
      await refreshTasteIdentityCacheForUser(userId);
      return apiOk({ ok: true, userId, repairInserted: repair.inserted, errors: repair.errors });
    } catch (e) {
      console.error("[cron] repair-artist-aggregates per-user", e);
      return apiError("Repair failed", 500);
    }
  }

  try {
    const result = await runRepairArtistAggregates();
    return apiOk(result);
  } catch (e) {
    console.error("[cron] repair-artist-aggregates", e);
    return apiError("Repair failed", 500);
  }
}
