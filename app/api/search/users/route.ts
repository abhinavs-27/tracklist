import { NextRequest } from "next/server";
import { searchUsers, enrichUsersWithFollowStatus } from "@/lib/queries";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { sanitizeString } from "@/lib/validation";
import { getPaginationParams } from "@/lib/api-utils";
import { withHandler } from "@/lib/api-handler";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;

/** Authenticated and logged-out search: guests get the same directory results without follow state beyond false. */
export const GET = withHandler(async (request: NextRequest, { user: me }) => {
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

  const users = await enrichUsersWithFollowStatus(rows, viewerId);

  return apiOk(users);
});
