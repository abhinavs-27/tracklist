import { withHandler } from "@/lib/api-handler";
import { isLiteQueryParam } from "@/lib/api-utils";
import { mapExploreTrendingToLite } from "@/lib/explore-api-serialize";
import { getExploreTrendingPayload } from "@/lib/explore-hub-data";
import { exploreSectionOrFallback } from "@/lib/explore-section-timeout";
import { apiInternalError } from "@/lib/api-response";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore/trending: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";
  const lite = isLiteQueryParam(request.nextUrl.searchParams);

  try {
    const res = await staleFirstApiOk(
      lite ? "explore:trending:lite:v1" : "explore:trending:v1",
      STALE_FIRST_TTL_SEC.exploreTrending,
      STALE_FIRST_STALE_AFTER_SEC.exploreTrending,
      async () => {
        const raw = await exploreSectionOrFallback(
          () => getExploreTrendingPayload(),
          { trending: [] },
        );
        if (lite) {
          return { trending: mapExploreTrendingToLite(raw.trending) };
        }
        return raw;
      },
      { bypassCache },
    );
    exploreLogLine(`explore/trending: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
