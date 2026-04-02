import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiNotFound, apiOk } from "@/lib/api-response";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { getWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseChartType(raw: string | null): ChartType | null {
  if (raw && TYPES.includes(raw as ChartType)) {
    return raw as ChartType;
  }
  return null;
}

/** GET /api/charts?type=…&weekStart=… (optional ISO `week_start` from stored charts; omit = latest). */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }

    const weekStart = searchParams.get("weekStart")?.trim() ?? null;

    const data = await getWeeklyChartForUser({
      userId: me!.id,
      chartType,
      weekStart,
    });

    if (!data) {
      return apiNotFound(
        "No chart yet — charts are built each Sunday for the prior week.",
      );
    }

    const res = apiOk(data);
    res.headers.set(
      "Cache-Control",
      "private, max-age=120, stale-while-revalidate=300",
    );
    return res;
  },
  { requireAuth: true },
);
