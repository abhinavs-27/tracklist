import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – trending entities (last 24h). Public. ?limit= (max 20). Rate limited 60/min per IP; cached ~10 min. */
export const GET = withHandler(async (request: NextRequest) => {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }
  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get("limit"), 20, 20);
  const items = await getTrendingEntitiesCached(limit);
  return apiOk(items);
});
