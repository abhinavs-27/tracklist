import { withHandler } from "@/lib/api-handler";
import { getCommunityTasteMatchesForViewer } from "@/lib/community/get-community-taste-matches";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/taste-matches — top similar / opposite members (weekly job data). */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see taste matches");
    }

    const { similar, opposite } = await getCommunityTasteMatchesForViewer(
      id,
      me!.id,
    );
    return apiOk({ similar, opposite, viewerUserId: me!.id });
  },
  { requireAuth: true },
);
