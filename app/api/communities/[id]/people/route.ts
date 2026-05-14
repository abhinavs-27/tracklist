import { withHandler } from "@/lib/api-handler";
import { apiForbidden, apiInternalError, apiNotFound, apiOk } from "@/lib/api-response";
import { getCommunityPeople } from "@/lib/community/get-community-people";
import { isCommunityMember } from "@/lib/community/queries";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/people — all members with 7-day listen stats; members only. */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) return apiForbidden("Members only");

    try {
      const people = await getCommunityPeople(id);
      return apiOk({ people });
    } catch (e) {
      return apiInternalError(e instanceof Error ? e : new Error(String(e)));
    }
  },
  { requireAuth: true },
);
