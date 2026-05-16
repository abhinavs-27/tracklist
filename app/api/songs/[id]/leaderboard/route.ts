import { withHandler } from "@/lib/api-handler";
import { apiOk, apiBadRequest, apiInternalError } from "@/lib/api-response";
import { getSongFriendLeaderboard } from "@/lib/queries";
import { isValidUuid } from "@/lib/validation";

export const GET = withHandler(async (request, { user: me, params }) => {
  try {
    const { id } = params;
    if (!id || !isValidUuid(id)) return apiBadRequest("Invalid song id");

    const entries = await getSongFriendLeaderboard(me!.id, id);
    return apiOk(entries ?? []);
  } catch (e) {
    return apiInternalError(e);
  }
}, { requireAuth: true });
