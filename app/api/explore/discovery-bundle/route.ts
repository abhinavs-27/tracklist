import { withHandler } from "@/lib/api-handler";
import { apiInternalError } from "@/lib/api-response";
import {
  getExploreDiscoveryBundle,
  type ExploreRangeParam,
} from "@/lib/explore-discovery-data";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

function parseRange(raw: string | null): ExploreRangeParam {
  const s = raw?.trim().toLowerCase();
  if (s === "24h" || s === "day") return "24h";
  return "week";
}

export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore/discovery-bundle: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";
  const range = parseRange(request.nextUrl.searchParams.get("range"));
  const cacheKey = `explore:discovery-bundle:${range}:v1`;

  try {
    const res = await staleFirstApiOk(
      cacheKey,
      STALE_FIRST_TTL_SEC.exploreDiscoveryBundle,
      STALE_FIRST_STALE_AFTER_SEC.exploreDiscoveryBundle,
      async () => getExploreDiscoveryBundle(range),
      { bypassCache },
    );
    exploreLogLine(`explore/discovery-bundle: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
