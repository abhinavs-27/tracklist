import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { logTasteComparison } from "@/lib/social/log-taste-comparison";
import { getTasteMatch } from "@/lib/taste/taste-match";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/taste-match?userB=<uuid>
 * Viewer is always the authenticated user (user A). Query `userA` is ignored for security.
 */
export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const { searchParams } = request.nextUrl;
    const userB = searchParams.get("userB")?.trim();

    const userAParam = searchParams.get("userA")?.trim();
    if (userAParam && userAParam !== me.id) {
      return apiForbidden("You can only compare taste as yourself.");
    }

    if (!userB) return apiBadRequest("Missing userB");
    if (!isValidUuid(userB)) return apiBadRequest("Invalid user id");

    const result = await getTasteMatch(me.id, userB);
    void logTasteComparison(me.id, userB);
    return apiOk(result);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
