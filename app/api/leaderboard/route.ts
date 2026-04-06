import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiOk, apiBadRequest } from "@/lib/api-response";
import { getLeaderboardWithTotal } from "@/lib/queries";
import { getPaginationParams, isLiteQueryParam } from "@/lib/api-utils";
import { mapLeaderboardEntriesToLite } from "@/lib/explore-api-serialize";
import { getLeaderboardPageFromPrecomputed } from "@/lib/precomputed-cache-read";

/**
 * GET /api/leaderboard
 * Query params:
 * - type: popular | topRated | mostFavorited  (metric)
 * - entity: song | album
 * - startYear, endYear
 * - cursor: optional last rank (number)
 * - limit: optional page size
 * - lite=true: omit weighted_score / favorite_count from each item
 */
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const typeParam = searchParams.get("type");
  const startYearParam = searchParams.get("startYear");
  const endYearParam = searchParams.get("endYear");
  const entityParam = searchParams.get("entity");
  const cursorParam = searchParams.get("cursor");

  const validTypes = ["popular", "topRated", "mostFavorited"] as const;
  if (!typeParam || !(validTypes as readonly string[]).includes(typeParam)) {
    return apiBadRequest(
      "type must be 'popular', 'topRated', or 'mostFavorited'",
    );
  }
  const type = typeParam as "popular" | "topRated" | "mostFavorited";

  const filters: { startYear?: number; endYear?: number } = {};
  if (startYearParam) {
    const startYear = parseInt(startYearParam, 10);
    if (isNaN(startYear) || startYear < 1900 || startYear > 2100) {
      return apiBadRequest("startYear must be a valid year");
    }
    filters.startYear = startYear;
  }
  if (endYearParam) {
    const endYear = parseInt(endYearParam, 10);
    if (isNaN(endYear) || endYear < 1900 || endYear > 2100) {
      return apiBadRequest("endYear must be a valid year");
    }
    filters.endYear = endYear;
  }

  const entity: "song" | "album" =
    entityParam === "album" || entityParam === "song" ? entityParam : "song";

  const cursor = cursorParam ? parseInt(cursorParam, 10) : 0;
  const { limit } = getPaginationParams(searchParams, 50, 100);
  const lite = isLiteQueryParam(searchParams);

  const startRank = cursor && cursor > 0 ? cursor + 1 : 1;
  const startIndex = startRank - 1;

  const hasYearFilter =
    filters.startYear != null || filters.endYear != null;

  if (!hasYearFilter) {
    const fromCache = await getLeaderboardPageFromPrecomputed(
      type,
      entity,
      limit,
      startIndex,
    );
    if (fromCache) {
      return apiOk({
        items: lite
          ? mapLeaderboardEntriesToLite(fromCache.items)
          : fromCache.items,
        nextCursor: fromCache.nextCursor,
        total: fromCache.total,
      });
    }
  }

  const { entries: pageItems, totalCount } = await getLeaderboardWithTotal(
    type,
    filters,
    entity,
    limit,
    startIndex,
  );

  if (pageItems.length === 0) {
    return apiOk({
      items: [],
      nextCursor: null,
      total: totalCount ?? 0,
    });
  }

  const lastRank = startIndex + pageItems.length;
  const hasMore =
    totalCount != null ? lastRank < totalCount : pageItems.length === limit;
  const nextCursor = hasMore ? lastRank : null;

  return apiOk({
    items: lite ? mapLeaderboardEntriesToLite(pageItems) : pageItems,
    nextCursor,
    total: totalCount ?? undefined,
  });
});
