import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { leaveCommunity } from "@/lib/community/leave-community";
import { isValidUuid } from "@/lib/validation";

/** POST /api/communities/[id]/leave — leave community (member only). */
export const POST = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid community");

    const result = await leaveCommunity(id, me!.id);
    if (!result.ok) {
      if (result.reason === "not_member") {
        return apiForbidden("You are not a member of this community");
      }
      return apiBadRequest("Could not leave community");
    }

    return apiOk({ left: true });
  },
  { requireAuth: true },
);
