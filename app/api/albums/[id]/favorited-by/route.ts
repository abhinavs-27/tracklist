import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getAlbumFavoritedByUsers } from "@/lib/queries";
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

/**
 * GET /api/albums/[id]/favorited-by?limit=&offset=
 * Public list of users who have this album as a profile favorite (ordered by username).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: RouteParams },
) {
  try {
    const { id: rawId } = await ctx.params;
    const albumId = rawId?.trim() ?? "";
    if (!albumId) return apiBadRequest("Missing album id");

    const viewer = await getUserFromRequest(request);
    const viewerId = viewer?.id ?? null;

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 50, 20);
    const offset = Number(searchParams.get("offset")) || 0;
    if (offset < 0) return apiBadRequest("offset must be >= 0");

    const { users, total } = await getAlbumFavoritedByUsers(albumId, viewerId, {
      limit,
      offset,
    });

    return apiOk({ users, total });
  } catch (e) {
    return apiInternalError(e);
  }
}
