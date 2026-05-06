import { NextRequest } from "next/server";
import { apiOk, apiBadRequest, apiUnauthorized, apiInternalError } from "@/lib/api-response";
import { getSongFriendLeaderboard } from "@/lib/queries";
import { getUserFromRequest } from "@/lib/auth";
import { isValidUuid } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  ctx: { params: RouteParams },
) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) return apiBadRequest("Invalid song id");

    const me = await getUserFromRequest(request);
    if (!me?.id) return apiUnauthorized();

    const entries = await getSongFriendLeaderboard(me.id, id);
    return apiOk(entries ?? []);
  } catch (e) {
    return apiInternalError(e);
  }
}
