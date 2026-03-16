import { NextRequest } from "next/server";
import { apiOk, apiBadRequest, apiInternalError } from "@/lib/api-response";
import { getLeaderboard } from "@/lib/queries";

/** GET ?type=popular|topRated|mostFavorited&startYear=optional&endYear=optional */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const startYearParam = searchParams.get("startYear");
    const endYearParam = searchParams.get("endYear");

    const validTypes = ["popular", "topRated", "mostFavorited"] as const;
    if (!typeParam || !validTypes.includes(typeParam as any)) {
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

    const data = await getLeaderboard(type, filters, 50);
    return apiOk(data);
  } catch (e) {
    return apiInternalError(e);
  }
}
