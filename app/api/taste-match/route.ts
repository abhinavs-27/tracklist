import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiOk,
} from "@/lib/api-response";
import { getTasteMatch } from "@/lib/taste/taste-match";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/taste-match?userB=<uuid>
 * Viewer is always the authenticated user (user A). Query `userA` is ignored for security.
 */
export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  const { searchParams } = new URL(request.url);
  const userB = searchParams.get("userB")?.trim();

  const userAParam = searchParams.get("userA")?.trim();
  if (userAParam && userAParam !== me!.id) {
    return apiForbidden("You can only compare taste as yourself.");
  }

  if (!userB) return apiBadRequest("Missing userB");
  if (!isValidUuid(userB)) return apiBadRequest("Invalid user id");

  const result = await getTasteMatch(me!.id, userB);
  return apiOk(result);
}, { requireAuth: true });
