import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { searchUsers, enrichUsersWithFollowStatus } from "@/lib/queries";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { sanitizeString } from "@/lib/validation";
import { getPaginationParams } from "@/lib/api-utils";
import type { User } from "@/types";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;

export type SearchUsersResponse = (User & { viewer_is_following: boolean })[];

/** Authenticated and logged-out search: guests get the same directory results without follow state beyond false. */
export const GET = withHandler(
  async (request, { user: me }) => {
    const viewerId = me?.id ?? null;

    const { searchParams } = request.nextUrl;
    const raw = searchParams.get("q") ?? "";
    const q = sanitizeString(raw, MAX_QUERY_LENGTH) ?? "";

    if (q.length < MIN_QUERY_LENGTH) {
      return apiBadRequest(
        `Query must be at least ${MIN_QUERY_LENGTH} characters`,
      );
    }

    const { limit } = getPaginationParams(searchParams, 20, 50);

    const rows = await searchUsers(q, limit, viewerId);
    if (rows.length === 0) return apiOk([]);

    const users = (await enrichUsersWithFollowStatus(rows, viewerId)) as SearchUsersResponse;

    return apiOk(users);
  },
  { requireAuth: false }
);
