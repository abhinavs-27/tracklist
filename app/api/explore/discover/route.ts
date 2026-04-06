import { withHandler } from "@/lib/api-handler";
import { getExploreDiscoverStaticPayload } from "@/lib/explore-discover-static";
import { apiInternalError } from "@/lib/api-response";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore/discover: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const res = await staleFirstApiOk(
      "explore:discover:v1",
      STALE_FIRST_TTL_SEC.exploreDiscover,
      STALE_FIRST_STALE_AFTER_SEC.exploreDiscover,
      async () => getExploreDiscoverStaticPayload(),
      { bypassCache },
    );
    exploreLogLine(`explore/discover: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
