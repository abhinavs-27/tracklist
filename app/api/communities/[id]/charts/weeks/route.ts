import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiForbidden, apiOk } from "@/lib/api-response";
import { listCommunityWeeklyChartWeeks } from "@/lib/charts/get-community-weekly-chart";
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

/** GET /api/communities/[id]/charts/weeks?type=… */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) {
      return apiBadRequest("Invalid community id");
    }

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see chart weeks");
    }

    const { searchParams } = new URL(request.url);
    const chartType = parseChartType(searchParams.get("type"));
    if (!chartType) {
      return apiBadRequest("type must be tracks, artists, or albums");
    }

    const weeks = await listCommunityWeeklyChartWeeks({
      communityId: id,
      chartType,
    });

    return apiOk({ weeks });
  },
  { requireAuth: true },
);
