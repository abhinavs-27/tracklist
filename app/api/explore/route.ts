import { withHandler } from "@/lib/api-handler";
import { getExploreHubPayload } from "@/lib/explore-hub-data";
import { apiInternalError } from "@/lib/api-response";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const res = await staleFirstApiOk(
      "explore:hub:v1",
      STALE_FIRST_TTL_SEC.explore,
      STALE_FIRST_STALE_AFTER_SEC.explore,
      async () => {
        const payload = await getExploreHubPayload();
        exploreLogLine(`explore: total: ${Date.now() - start} ms`);
        return payload;
      },
      { bypassCache },
    );
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
