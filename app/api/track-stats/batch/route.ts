import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getTrackStatsForTrackIds } from "@/lib/queries";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

const MAX_IDS = 400;

/** Batch track listen/review stats for album pages (client-deferred). */
export const POST = withHandler(async (request: NextRequest) => {
  const { data: body, error: parseErr } = await parseBody<{
    track_ids?: unknown;
  }>(request);
  if (parseErr) return parseErr;
  const raw = body?.track_ids;
  if (!Array.isArray(raw)) {
    return apiBadRequest("Expected track_ids array");
  }
  const trackIds = raw.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (trackIds.length === 0) return apiOk({ stats: {} });
  if (trackIds.length > MAX_IDS) {
    return apiBadRequest(`At most ${MAX_IDS} track_ids per request`);
  }
  const stats = await getTrackStatsForTrackIds(trackIds);
  return apiOk({ stats });
});
