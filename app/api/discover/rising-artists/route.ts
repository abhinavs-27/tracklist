import { withHandler } from "@/lib/api-handler";
import { apiOk, apiTooManyRequests } from "@/lib/api-response";
import { getRisingArtistsCached } from "@/lib/discover-cache";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – rising artists (growth in listens). Public. ?limit= & ?windowDays= (default 7). Rate limited 60/min per IP; cached ~10 min. */
export const GET = withHandler(async (request) => {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }
  const { searchParams } = request.nextUrl;
  const limit = clampLimit(searchParams.get("limit"), 20, 20);
  const windowDays = Math.min(
    Math.max(1, parseInt(searchParams.get("windowDays") ?? "7", 10) || 7),
    90
  );
  const items = await getRisingArtistsCached(limit, windowDays);
  return apiOk(items);
});
