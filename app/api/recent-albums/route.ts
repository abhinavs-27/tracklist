import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getCachedRecentAlbumsFromLogs } from "@/lib/profile/recent-activity-cache";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";
import type { RecentAlbumItem } from "@/lib/recent-from-logs";

export type { RecentAlbumItem };

/** Recent unique albums — derived only from `logs` + catalog (all listen sources). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId || !isValidUuid(userId)) return apiBadRequest("Valid user_id required");

    await getUserFromRequest(request);

    const limitRaw = searchParams.get("limit");
    const limit = limitRaw
      ? Math.min(48, Math.max(1, parseInt(limitRaw, 10) || 12))
      : 12;

    const bust = searchParams.get("refresh") === "1";
    const albums = await getCachedRecentAlbumsFromLogs(userId, limit, bust);
    return apiOk({ albums });
  } catch (e) {
    return apiInternalError(e);
  }
}
