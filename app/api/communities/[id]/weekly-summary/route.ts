import { withHandler } from "@/lib/api-handler";
import { getCommunityWeeklySummaryWithTrend } from "@/lib/community/get-community-weekly-summary";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/weekly-summary — weekly identity + trend vs prior week. */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see the weekly summary");
    }

    const data = await getCommunityWeeklySummaryWithTrend(id);
    return apiOk(data);
  },
  { requireAuth: true },
);
