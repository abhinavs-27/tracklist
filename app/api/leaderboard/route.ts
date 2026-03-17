import { NextRequest } from "next/server";
import { apiOk, apiBadRequest, apiInternalError } from "@/lib/api-response";
import { getLeaderboard } from "@/lib/queries";

/** 
 * GET /api/leaderboard
 * Query params:
 * - type: popular | topRated | mostFavorited  (metric)
 * - entity: song | album
 * - startYear, endYear
 * - cursor: optional last rank (number)
 * - limit: optional page size
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const startYearParam = searchParams.get("startYear");
    const endYearParam = searchParams.get("endYear");
    const entityParam = searchParams.get("entity");
    const cursorParam = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");

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
    const rawLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 10), 100)
      : 50;

    // Fetch a reasonably large sorted list once, then window it by rank.
    const MAX_ENTRIES = 1000;
    const allEntries = await getLeaderboard(type, filters, entity, MAX_ENTRIES);

    const total = allEntries.length;
    if (total === 0) {
      return apiOk({ items: [], nextCursor: null });
    }

    const startRank = cursor && cursor > 0 ? cursor + 1 : 1;
    const startIndex = startRank - 1;
    const endIndex = startIndex + limit;
    const pageItems = allEntries.slice(startIndex, endIndex);

    const lastRank = startIndex + pageItems.length;
    const hasMore = lastRank < total;
    const nextCursor = hasMore ? lastRank : null;

    return apiOk({
      items: pageItems,
      nextCursor,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}
