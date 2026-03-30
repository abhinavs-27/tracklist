import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { getListeningInsights } from "@/lib/taste/listening-insights";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/listening-insights?userId=<uuid optional>
 * Requires auth. Without userId, returns insights for the signed-in user.
 */
export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const { searchParams } = request.nextUrl;
    const raw = searchParams.get("userId")?.trim();
    if (raw && !isValidUuid(raw)) {
      return apiBadRequest("userId must be a valid UUID");
    }
    const targetId = raw ?? me.id;
    const data = await getListeningInsights(targetId);
    return apiOk(data);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
