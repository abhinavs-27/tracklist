import { withHandler } from "@/lib/api-handler";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/members/stats — per-member stats + streaks + weekly roles. */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see member stats");
    }

    const members = await getCommunityMemberStatsWithRoles(id);
    return apiOk({ members });
  },
  { requireAuth: true },
);
