import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/taste-identity?userId=<uuid optional>
 * - With `userId` (valid UUID): public — anyone can load that profile's taste (aggregates only).
 * - Without `userId`: requires auth; returns the signed-in user's taste.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("userId")?.trim();
    if (raw && !isValidUuid(raw)) {
      return apiBadRequest("userId must be a valid UUID");
    }
    if (raw) {
      const data = await getTasteIdentity(raw);
      return apiOk(data);
    }
    const me = await requireApiAuth(request);
    const data = await getTasteIdentity(me.id);
    return apiOk(data);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
