import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { getCachedRecentTracksFromLogs } from "@/lib/profile/recent-activity-cache";
import { apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const me = await requireApiAuth(request);

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), MAX_LIMIT, 50);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const userId = me.id;
    const bust = searchParams.get("refresh") === "1";

    const { items, hasMore } = await getCachedRecentTracksFromLogs(
      userId,
      limit,
      offset,
      { bust, trySpotifySync: true },
    );

    return apiOk({ items, hasMore });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
