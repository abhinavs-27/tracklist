import { withHandler } from "@/lib/api-handler";
import { isLiteQueryParam } from "@/lib/api-utils";
import { mapLeaderboardEntriesToLite } from "@/lib/explore-api-serialize";
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
  const lite = isLiteQueryParam(request.nextUrl.searchParams);

  try {
    const res = await staleFirstApiOk(
      lite ? "explore:leaderboard:lite:v1" : "explore:leaderboard:v1",
      STALE_FIRST_TTL_SEC.exploreLeaderboard,
      STALE_FIRST_STALE_AFTER_SEC.exploreLeaderboard,
      async () => {
        const raw = await exploreSectionOrFallback(
          () => getExploreLeaderboardPayload(),
          { leaderboard: [] },
        );
        if (lite) {
          return {
            leaderboard: mapLeaderboardEntriesToLite(raw.leaderboard),
          };
        }
        return raw;
      },
      { bypassCache },
    );
    exploreLogLine(`explore/leaderboard: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
