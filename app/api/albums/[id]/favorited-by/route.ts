import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getAlbumFavoritedByUsers } from "@/lib/queries";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";

/**
 * GET /api/albums/[id]/favorited-by?limit=&offset=
 * Public list of users who have this album as a profile favorite (ordered by username).
 */
export const GET = withHandler(async (request: NextRequest, { params, userId: viewerId }) => {
  const { id: rawId } = params;
  const albumId = rawId?.trim() ?? "";
  if (!albumId) return apiBadRequest("Missing album id");

  const { searchParams } = request.nextUrl;
  const { limit, offset } = getPaginationParams(searchParams, 20, 50);

  const { users, total } = await getAlbumFavoritedByUsers(albumId, viewerId ?? null, {
    limit,
    offset,
  });

  return apiOk({ users, total });
});
