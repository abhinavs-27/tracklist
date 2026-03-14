import { NextRequest, NextResponse } from "next/server";
import { getHiddenGems } from "@/lib/queries";
import { apiInternalError } from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

/** GET – hidden gems (high rating, low listens). Public. ?limit= & ?minRating= & ?maxListens= */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const minRating = Math.min(
      Math.max(0, parseFloat(searchParams.get("minRating") ?? "4") || 4),
      5
    );
    const maxListens = Math.min(
      Math.max(0, parseInt(searchParams.get("maxListens") ?? "50", 10) || 50),
      10000
    );
    const items = await getHiddenGems(limit, minRating, maxListens);
    return NextResponse.json(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
