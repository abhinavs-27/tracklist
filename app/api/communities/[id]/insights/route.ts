import { withHandler } from "@/lib/api-handler";
import { getCommunityInsights } from "@/lib/community/getCommunityInsights";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/insights — last 7 days; members only. */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see insights");
    }

    const insights = await getCommunityInsights(id);
    return apiOk({ insights });
  },
  { requireAuth: true },
);
