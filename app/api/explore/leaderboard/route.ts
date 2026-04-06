import { withHandler } from "@/lib/api-handler";
import { getExploreLeaderboardPayload } from "@/lib/explore-hub-data";
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
  exploreLogLine("explore/leaderboard: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const res = await staleFirstApiOk(
      "explore:leaderboard:v1",
      STALE_FIRST_TTL_SEC.exploreLeaderboard,
      STALE_FIRST_STALE_AFTER_SEC.exploreLeaderboard,
      async () =>
        exploreSectionOrFallback(
          () => getExploreLeaderboardPayload(),
          { leaderboard: [] },
        ),
      { bypassCache },
    );
    exploreLogLine(`explore/leaderboard: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
