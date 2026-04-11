import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiNotFound } from "@/lib/api-response";
import { parseChartType } from "@/lib/charts/weekly-chart-types";
import { getWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

/** GET /api/charts?type=…&weekStart=… (optional ISO `week_start` from stored charts; omit = latest). */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }

    const weekStart = searchParams.get("weekStart")?.trim() ?? null;
    const bypassCache = searchParams.get("refresh") === "1";
    const userId = me!.id;
    const cacheKey = `billboard:chart:${userId}:${chartType}:${weekStart ?? "latest"}`;

    const res = await staleFirstApiOk(
      cacheKey,
      STALE_FIRST_TTL_SEC.billboard,
      STALE_FIRST_STALE_AFTER_SEC.billboard,
      async () =>
        getWeeklyChartForUser({
          userId,
          chartType,
          weekStart,
        }),
      {
        bypassCache,
        cacheWhen: (v) => v != null,
        notFoundResponse: () =>
          apiNotFound(
            "No chart yet — charts are built each Sunday for the prior week.",
          ),
      },
    );
    return res;
  },
  { requireAuth: true },
);
