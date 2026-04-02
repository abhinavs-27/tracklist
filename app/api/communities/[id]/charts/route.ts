import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { getCommunityWeeklyChart } from "@/lib/charts/get-community-weekly-chart";
import type { ChartType } from "@/lib/charts/weekly-chart-types";
import { isCommunityMember } from "@/lib/community/queries";
import { isValidUuid } from "@/lib/validation";

const TYPES: ChartType[] = ["tracks", "artists", "albums"];

function parseChartType(raw: string | null): ChartType | null {
  if (raw && TYPES.includes(raw as ChartType)) {
    return raw as ChartType;
  }
  return null;
}

/** GET /api/communities/[id]/charts?type=…&weekStart=… — members only. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see the weekly chart");
    }

    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }

    const weekStart = searchParams.get("weekStart")?.trim() ?? null;

    const data = await getCommunityWeeklyChart({
      communityId: id,
      chartType,
      weekStart,
      viewerId: me!.id,
    });

    if (!data) {
      return apiNotFound(
        "No chart yet — community charts are built each Sunday for the prior week.",
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
