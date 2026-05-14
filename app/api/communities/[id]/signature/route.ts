import { withHandler } from "@/lib/api-handler";
import { apiForbidden, apiInternalError, apiNotFound, apiOk } from "@/lib/api-response";
import { getCommunitySignature } from "@/lib/community/community-signature";
import { isCommunityMember } from "@/lib/community/queries";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/signature — viewer's signature in this community. */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) return apiForbidden("Members only");

    try {
      const data = await getCommunitySignature(me!.id, id);
      return apiOk(data);
    } catch (e) {
      return apiInternalError(e instanceof Error ? e : new Error(String(e)));
    }
  },
  { requireAuth: true },
);
