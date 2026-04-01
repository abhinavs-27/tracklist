import { withHandler } from "@/lib/api-handler";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiOk } from "@/lib/api-response";
import { validateUuidParam, getPaginationParams } from "@/lib/api-utils";
import { LIMITS } from "@/lib/validation";

/** GET /api/communities/[id]/members/stats — per-member stats + streaks + weekly roles. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const idParam = params.id?.trim() ?? "";
    const uuidRes = validateUuidParam(idParam);
    if (!uuidRes.ok) return uuidRes.error;
    const id = uuidRes.id;

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see member stats");
    }

    const { searchParams } = request.nextUrl;
    const { limit, offset } = getPaginationParams(searchParams, 50, LIMITS.LOGS_LIMIT);

    const members = await getCommunityMemberStatsWithRoles(id, limit, offset);
    return apiOk({ members });
  },
  { requireAuth: true },
);
