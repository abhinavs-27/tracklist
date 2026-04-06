import { withHandler } from "@/lib/api-handler";
import { apiInternalError } from "@/lib/api-response";
import { getExploreHiddenGems } from "@/lib/explore-discovery-data";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore/hidden-gems: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const res = await staleFirstApiOk(
      "explore:hidden-gems:v1",
      STALE_FIRST_TTL_SEC.exploreDiscoverySection,
      STALE_FIRST_STALE_AFTER_SEC.exploreDiscoverySection,
      async () => ({ items: await getExploreHiddenGems(16) }),
      { bypassCache },
    );
    exploreLogLine(`explore/hidden-gems: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
