import { withHandler } from "@/lib/api-handler";
import { isLiteQueryParam } from "@/lib/api-utils";
import {
  mapExploreReviewsToLite,
  mapExploreTrendingToLite,
  mapLeaderboardEntriesToLite,
} from "@/lib/explore-api-serialize";
import {
  getExploreTrendingPayload,
  getExploreLeaderboardPayload,
} from "@/lib/explore-hub-data";
import { getExploreDiscoverStaticPayload } from "@/lib/explore-discover-static";
import { getExploreRecentAlbumReviews } from "@/lib/explore-reviews-preview";
import { exploreSectionOrFallback } from "@/lib/explore-section-timeout";
import { apiInternalError } from "@/lib/api-response";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

/**
 * Legacy combined Explore hub (mobile + older clients).
 * Prefer `/api/explore/trending`, `/leaderboard`, `/discover`, `/reviews` for parallel loads.
 */
export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore: start (combined)");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";
  const lite = isLiteQueryParam(request.nextUrl.searchParams);

  try {
    const res = await staleFirstApiOk(
      lite ? "explore:hub:lite:v2" : "explore:hub:v2",
      STALE_FIRST_TTL_SEC.explore,
      STALE_FIRST_STALE_AFTER_SEC.explore,
      async () => {
        const [trendingRes, leaderboardRes, discover, reviewsRes] =
          await Promise.all([
            exploreSectionOrFallback(
              () => getExploreTrendingPayload(),
              { trending: [] },
            ),
            exploreSectionOrFallback(
              () => getExploreLeaderboardPayload(),
              { leaderboard: [] },
            ),
            Promise.resolve(getExploreDiscoverStaticPayload()),
            exploreSectionOrFallback(
              () => getExploreRecentAlbumReviews(8),
              { reviews: [] },
            ),
          ]);
        exploreLogLine(`explore: total: ${Date.now() - start} ms`);
        if (lite) {
          return {
            trending: mapExploreTrendingToLite(trendingRes.trending),
            leaderboard: mapLeaderboardEntriesToLite(leaderboardRes.leaderboard),
            discover,
            reviews: mapExploreReviewsToLite(reviewsRes.reviews),
          };
        }
        return {
          trending: trendingRes.trending,
          leaderboard: leaderboardRes.leaderboard,
          discover,
          reviews: reviewsRes.reviews,
        };
      },
      { bypassCache },
    );
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
