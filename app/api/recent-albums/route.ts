import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getCachedRecentAlbumsFromLogs } from "@/lib/profile/recent-activity-cache";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";
import { getPaginationParams } from "@/lib/api-utils";
import type { RecentAlbumItem } from "@/lib/recent-from-logs";

export type { RecentAlbumItem };

/** Recent unique albums — derived only from `logs` + catalog (all listen sources). */
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("user_id");
  if (!userId || !isValidUuid(userId)) return apiBadRequest("Valid user_id required");

  const { limit } = getPaginationParams(searchParams, 12, 48);

  const bust = searchParams.get("refresh") === "1";
  const albums = await getCachedRecentAlbumsFromLogs(userId, limit, bust);
  return apiOk({ albums });
});
