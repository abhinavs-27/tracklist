import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getRelatedMedia } from "@/lib/discovery/getRelatedMedia";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

/** GET /api/recommendations/album?album_id=...&limit=10. Returns { recommendations: { album_id, score }[] } from co-occurrence. */
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const albumId = searchParams.get("album_id")?.trim();
  if (!albumId) return apiBadRequest("album_id required");
  const limit = clampLimit(searchParams.get("limit"), 10, 20);
  const related = await getRelatedMedia("album", albumId, limit);
  const recommendations = related.map((r) => ({
    album_id: r.contentId,
    score: r.score,
  }));
  return apiOk({ recommendations });
});
