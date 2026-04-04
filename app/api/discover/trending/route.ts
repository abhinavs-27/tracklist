import { withHandler } from "@/lib/api-handler";
import { apiOk, apiTooManyRequests } from "@/lib/api-response";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – trending entities (last 24h). Public. ?limit= (max 20). Rate limited 60/min per IP; cached ~10 min. */
export const GET = withHandler(async (request) => {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }
  const { searchParams } = request.nextUrl;
  const limit = clampLimit(searchParams.get("limit"), 20, 20);
  const items = await getTrendingEntitiesCached(limit);
  return apiOk(items);
});
