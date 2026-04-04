import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getHiddenGemsCached } from "@/lib/discover-cache";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import { apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – hidden gems (high rating, low listens). Public. ?limit= & ?minRating= & ?maxListens= Rate limited 60/min per IP; cached ~10 min. Defaults from chart config. */
export const GET = withHandler(async (request: NextRequest) => {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }
  const hiddenGemsConfig = getChartConfig("hidden_gems");
  const defaultMinRating = hiddenGemsConfig?.filters?.min_rating ?? 4;
  const defaultMaxListens = hiddenGemsConfig?.filters?.max_plays ?? 50;

  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get("limit"), 20, 20);
  const minRating = Math.min(
    Math.max(0, parseFloat(searchParams.get("minRating") ?? String(defaultMinRating)) || defaultMinRating),
    5
  );
  const maxListens = Math.min(
    Math.max(0, parseInt(searchParams.get("maxListens") ?? String(defaultMaxListens), 10) || defaultMaxListens),
    10000
  );
  const items = await getHiddenGemsCached(limit, minRating, maxListens);
  return apiOk(items);
});
