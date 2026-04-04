import { withHandler } from "@/lib/api-handler";
import { getUserRecommendations } from "@/lib/queries";
import { apiOk } from "@/lib/api-response";

/** GET /api/recommendations/user. Returns { recommendations: { album_id, score }[] }. Auth required. */
export const GET = withHandler(async (_request, { user: me }) => {
  const recommendations = await getUserRecommendations(me!.id, 20);
  return apiOk({ recommendations });
}, { requireAuth: true });
