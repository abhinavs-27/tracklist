import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getFollowListWithStatus, getUserIdByUsername } from "@/lib/queries";
import {
  apiBadRequest,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

export const GET = withHandler(
  async (request: NextRequest, { params, userId: viewerId }) => {
    const { username } = params;
    if (!username?.trim()) return apiNotFound("User not found");

    const userId = await getUserIdByUsername(username);
    if (!userId) return apiNotFound("User not found");

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 50, 20);
    const offset = Number(searchParams.get("offset")) || 0;
    if (offset < 0) return apiBadRequest("offset must be >= 0");

    const result = await getFollowListWithStatus(userId, viewerId ?? null, "following", {
      limit,
      offset,
    });

    return apiOk(result);
  },
  { requireAuth: false },
);
