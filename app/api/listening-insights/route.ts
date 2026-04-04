import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { getListeningInsights } from "@/lib/taste/listening-insights";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/listening-insights?userId=<uuid optional>
 * Requires auth. Without userId, returns insights for the signed-in user.
 */
export const GET = withHandler(async (request, { user: me }) => {
  const { searchParams } = request.nextUrl;
  const raw = searchParams.get("userId")?.trim();
  if (raw && !isValidUuid(raw)) {
    return apiBadRequest("userId must be a valid UUID");
  }
  const targetId = raw ?? me!.id;
  const data = await getListeningInsights(targetId);
  return apiOk(data);
}, { requireAuth: true });
