import { withHandler } from "@/lib/api-handler";
import { getCommunityWeeklySummaryWithTrend } from "@/lib/community/get-community-weekly-summary";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/weekly-summary — weekly identity + trend vs prior week. Optional `timeZone` (IANA) for local activity buckets. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see the weekly summary");
    }

    const tz = new URL(request.url).searchParams.get("timeZone")?.trim();
    const data = await getCommunityWeeklySummaryWithTrend(
      id,
      tz ? { timeZone: tz } : undefined,
    );
    return apiOk(data);
  },
  { requireAuth: true },
);
