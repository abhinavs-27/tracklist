import { NextRequest } from "next/server";
import { getHiddenGemsCached } from "@/lib/discover-cache";
import { apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – hidden gems (high rating, low listens). Public. ?limit= & ?minRating= & ?maxListens= Rate limited 60/min per IP; cached ~10 min. */
export async function GET(request: NextRequest) {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const minRating = Math.min(
      Math.max(0, parseFloat(searchParams.get("minRating") ?? "4") || 4),
      5
    );
    const maxListens = Math.min(
      Math.max(0, parseInt(searchParams.get("maxListens") ?? "50", 10) || 50),
      10000
    );
    const items = await getHiddenGemsCached(limit, minRating, maxListens);
    return apiOk(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
