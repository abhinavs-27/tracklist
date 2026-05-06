import { NextRequest } from "next/server";
import { apiOk, apiBadRequest, apiInternalError } from "@/lib/api-response";
import { getReviewsForArtist } from "@/lib/queries";
import { isValidUuid } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  ctx: { params: RouteParams },
) {
  try {
    const { id } = await ctx.params;
    if (!id || !isValidUuid(id)) return apiBadRequest("Invalid artist id");

    const { searchParams } = new URL(request.url);
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? "6")));

    const reviews = await getReviewsForArtist(id, limit);
    return apiOk(reviews);
  } catch (e) {
    return apiInternalError(e);
  }
}
