import { withHandler } from "@/lib/api-handler";
import { getUserFromRequest } from "@/lib/auth";
import {
  listUsersByCreatedAt,
  enrichUsersWithFollowStatus,
} from "@/lib/queries";
import { apiOk } from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Authenticated and logged-out browse: earliest signups first. */
export const GET = withHandler(async (request) => {
  const me = await getUserFromRequest(request);
  const viewerId = me?.id ?? null;

  const { searchParams } = request.nextUrl;
  const { limit, offset } = getPaginationParams(
    searchParams,
    DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  const overfetch = Math.min(limit + 1, MAX_LIMIT + 1);
  const rows = await listUsersByCreatedAt(overfetch, offset, viewerId);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const users = await enrichUsersWithFollowStatus(page, viewerId);

  return apiOk({ users, hasMore });
});
