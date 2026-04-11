import { withHandler } from "@/lib/api-handler";
import { apiBadRequest } from "@/lib/api-response";
import { parseChartType } from "@/lib/charts/weekly-chart-types";
import { listWeeklyChartWeeksForUser } from "@/lib/charts/get-user-weekly-chart";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

/** GET /api/charts/weeks?type=tracks — week boundaries for the signed-in user (newest first). */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }
    const limit = Math.min(
      156,
      Math.max(1, parseInt(searchParams.get("limit") ?? "104", 10) || 104),
    );
    const bypassCache = searchParams.get("refresh") === "1";
    const userId = me!.id;
    const cacheKey = `billboard:weeks:${userId}:${chartType}:${limit}`;

    return staleFirstApiOk(
      cacheKey,
      STALE_FIRST_TTL_SEC.billboard,
      STALE_FIRST_STALE_AFTER_SEC.billboard,
      async () => {
        const weeks = await listWeeklyChartWeeksForUser({
          userId,
          chartType,
          limit,
        });
        return { weeks };
      },
      { bypassCache },
    );
  },
  { requireAuth: true },
);
