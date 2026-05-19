import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiOk, apiBadRequest } from "@/lib/api-response";
import { getReviewsForArtist } from "@/lib/queries";
import { isValidUuid } from "@/lib/validation";
import type { ArtistReviewsResponse } from "@/types";

export const GET = withHandler(async (request: NextRequest, { params }) => {
  const { id } = params;
  if (!id || !isValidUuid(id)) return apiBadRequest("Invalid artist id");

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    20,
    Math.max(1, Number(searchParams.get("limit") ?? "6")),
  );

  const reviews = await getReviewsForArtist(id, limit);
  return apiOk<ArtistReviewsResponse>(reviews);
});
