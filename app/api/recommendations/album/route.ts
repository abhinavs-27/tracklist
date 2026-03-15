import { NextRequest } from "next/server";
import { getAlbumRecommendations } from "@/lib/queries";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { clampLimit, LIMITS } from "@/lib/validation";

/** GET /api/recommendations/album?album_id=...&limit=10. Returns { recommendations: { album_id, score }[] }. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const albumId = searchParams.get("album_id")?.trim();
    if (!albumId) return apiBadRequest("album_id required");
    const limit = clampLimit(searchParams.get("limit"), 10, 20);
    const recommendations = await getAlbumRecommendations(albumId, limit);
    return apiOk({ recommendations });
  } catch (e) {
    return apiInternalError(e);
  }
}
