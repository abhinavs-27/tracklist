import { withHandler } from "@/lib/api-handler";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid, clampLimit, LIMITS } from "@/lib/validation";

/** GET /api/communities/[id]/members/stats — per-member stats + streaks + weekly roles. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see member stats");
    }

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), LIMITS.LOGS_LIMIT, 50);
    const offsetRaw = parseInt(searchParams.get("offset") ?? "0", 10);
    const offset = Number.isNaN(offsetRaw) ? 0 : Math.max(0, offsetRaw);

    const members = await getCommunityMemberStatsWithRoles(id, limit, offset);
    return apiOk({ members });
  },
  { requireAuth: true },
);
