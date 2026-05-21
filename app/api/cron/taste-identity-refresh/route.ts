import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiBadRequest } from "@/lib/api-response";
import { runTasteIdentityRefresh } from "@/lib/cron/cron-runners";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { isValidUuid } from "@/lib/validation";

/**
 * Taste identity refresh — recomputes `taste_identity_cache` from aggregates.
 * Pass `?userId=<uuid>` to refresh a single user immediately.
 * Production schedule: EventBridge → SQS.
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
    await refreshTasteIdentityCacheForUser(userId);
    return apiOk({ ok: true, refreshed: userId });
  }

  const result = await runTasteIdentityRefresh();
  return apiOk(result);
}

