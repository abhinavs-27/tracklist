import { NextRequest } from "next/server";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – trending entities (last 24h). Public. ?limit= (max 20). Rate limited 60/min per IP; cached ~10 min. */
export async function GET(request: NextRequest) {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const { searchParams } = request.nextUrl;
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const items = await getTrendingEntitiesCached(limit);
    return apiOk(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
