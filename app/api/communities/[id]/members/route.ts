import { withHandler } from "@/lib/api-handler";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { getCommunityMembersRoster } from "@/lib/community/get-community-members-roster";
import { getCommunityById, isCommunityMember } from "@/lib/community/queries";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/members?page=1 — paginated roster; members only. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see members");
    }

    const community = await getCommunityById(id);
    if (!community) return apiNotFound("Community not found");

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

    const data = await getCommunityMembersRoster(id, me!.id, community.created_by, {
      page,
    });
    return apiOk(data);
  },
  { requireAuth: true },
);
