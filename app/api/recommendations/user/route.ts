import { requireApiAuth } from "@/lib/auth";
import { getUserRecommendations } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";

/** GET /api/recommendations/user. Returns { recommendations: { album_id, score }[] }. Auth required. */
export async function GET() {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;
    const recommendations = await getUserRecommendations(session.user.id, 20);
    return apiOk({ recommendations });
  } catch (e) {
    return apiInternalError(e);
  }
}
