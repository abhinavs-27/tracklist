import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiOk, apiBadRequest } from "@/lib/api-response";
import { getAlbumFriendLeaderboard } from "@/lib/queries";
import { isValidUuid } from "@/lib/validation";
import type { LeaderboardResponse } from "@/types";

export const GET = withHandler(
  async (request: NextRequest, { params, user: me }) => {
    const { id } = params;
    if (!id || !isValidUuid(id)) return apiBadRequest("Invalid album id");

    const entries = await getAlbumFriendLeaderboard(me!.id, id);
    return apiOk<LeaderboardResponse>(entries ?? []);
  },
  { requireAuth: true },
);
