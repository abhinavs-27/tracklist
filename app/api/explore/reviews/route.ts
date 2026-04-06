import { withHandler } from "@/lib/api-handler";
import { isLiteQueryParam } from "@/lib/api-utils";
import { mapExploreReviewsToLite } from "@/lib/explore-api-serialize";
import { getExploreRecentAlbumReviews } from "@/lib/explore-reviews-preview";
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
  exploreLogLine("explore/reviews: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";
  const lite = isLiteQueryParam(request.nextUrl.searchParams);

  try {
    const res = await staleFirstApiOk(
      lite ? "explore:reviews:lite:v1" : "explore:reviews:v1",
      STALE_FIRST_TTL_SEC.exploreReviews,
      STALE_FIRST_STALE_AFTER_SEC.exploreReviews,
      async () => {
        const raw = await exploreSectionOrFallback(
          () => getExploreRecentAlbumReviews(8),
          { reviews: [] },
        );
        if (lite) {
          return { reviews: mapExploreReviewsToLite(raw.reviews) };
        }
        return raw;
      },
      { bypassCache },
    );
    exploreLogLine(`explore/reviews: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
