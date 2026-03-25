import { withHandler } from "@/lib/api-handler";
import { acceptCommunityInvite } from "@/lib/community/invites";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** POST /api/communities/invites/:inviteId/accept */
export const POST = withHandler(
  async (_request, { user: me, params }) => {
    const iid = params.inviteId?.trim() ?? "";
    if (!iid || !isValidUuid(iid)) return apiNotFound("Invalid invite");

    const result = await acceptCommunityInvite(iid, me!.id);
    if (!result.ok) {
      switch (result.reason) {
        case "forbidden":
          return apiForbidden("This invite is not for you");
        case "not_found":
          return apiNotFound("Invite not found");
        case "not_pending":
          return apiBadRequest("This invite is no longer pending");
        default:
          return apiBadRequest("Could not accept invite");
      }
    }
    return apiOk({ accepted: true });
  },
  { requireAuth: true },
);
