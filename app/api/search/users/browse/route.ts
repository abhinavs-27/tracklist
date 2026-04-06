import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { listUsersByCreatedAt, enrichUsersWithFollowStatus } from "@/lib/queries";
import { apiOk } from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const GET = withHandler(
  async (request: NextRequest, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const { limit, offset } = getPaginationParams(searchParams, DEFAULT_LIMIT, MAX_LIMIT);

    /** Fetch one extra row so we know if another page exists (avoids empty “next” page). */
    const overfetch = Math.min(limit + 1, MAX_LIMIT + 1);
    const rows = await listUsersByCreatedAt(overfetch, offset, me!.id);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const users = await enrichUsersWithFollowStatus(page, me!.id);

    return apiOk({ users, hasMore });
  },
  { requireAuth: true },
);
