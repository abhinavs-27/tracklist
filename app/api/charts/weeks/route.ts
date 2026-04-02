import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { listWeeklyChartWeeksForUser } from "@/lib/charts/get-user-weekly-chart";

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseChartType(raw: string | null): ChartType | null {
  if (raw && TYPES.includes(raw as ChartType)) {
    return raw as ChartType;
  }
  return null;
}

/** GET /api/charts/weeks?type=tracks — week boundaries for the signed-in user (newest first). */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }
    const limit = Math.min(
      156,
      Math.max(1, parseInt(searchParams.get("limit") ?? "104", 10) || 104),
    );

    const weeks = await listWeeklyChartWeeksForUser({
      userId: me!.id,
      chartType,
      limit,
    });

    const res = apiOk({ weeks });
    res.headers.set(
      "Cache-Control",
      "private, max-age=120, stale-while-revalidate=300",
    );
    return res;
  },
  { requireAuth: true },
);
