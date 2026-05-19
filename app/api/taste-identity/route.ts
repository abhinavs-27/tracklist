import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk, apiUnauthorized } from "@/lib/api-response";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { isValidUuid } from "@/lib/validation";
import type { TasteIdentityResponse } from "@/types";

/**
 * GET /api/taste-identity?userId=<uuid optional>
 * - With `userId` (valid UUID): public — anyone can load that profile's taste (aggregates only).
 * - Without `userId`: requires auth; returns the signed-in user's taste.
 */
export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("userId")?.trim();

  if (raw && !isValidUuid(raw)) {
    return apiBadRequest("userId must be a valid UUID");
  }

  if (raw) {
    const data = await getTasteIdentity(raw);
    return apiOk<TasteIdentityResponse>(data);
  }

  const userId = me?.id;
  if (!userId) {
    // This route is optionally authenticated if userId is missing.
    // withHandler's requireAuth: false (default) will populate me if session exists.
    // But if no userId param and no session, we must fail with 401.
    return apiUnauthorized("Authentication required to view your own taste");
  }

  const data = await getTasteIdentity(userId);
  return apiOk<TasteIdentityResponse>(data);
});
