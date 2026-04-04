import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";
import { enrichUsersWithFollowStatus, listUsersByCreatedAt } from "@/lib/queries";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const GET = withHandler(async (request, { user: me }) => {
  const { limit, offset } = getPaginationParams(
    request.nextUrl.searchParams,
    DEFAULT_LIMIT,
    MAX_LIMIT
  );

  /** Fetch one extra row so we know if another page exists (avoids empty “next” page). */
  const overfetch = Math.min(limit + 1, MAX_LIMIT + 1);
  const rows = await listUsersByCreatedAt(overfetch, offset, me!.id);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const users = await enrichUsersWithFollowStatus(page, me!.id);

  return apiOk({ users, hasMore });
}, { requireAuth: true });
