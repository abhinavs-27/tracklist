import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { getUserRecommendations } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";

/** GET /api/recommendations/user. Returns { recommendations: { album_id, score }[] }. Auth required. */
export async function GET() {
  try {
    const me = await requireApiAuth();
    const recommendations = await getUserRecommendations(me.id, 20);
    return apiOk({ recommendations });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
