import { NextRequest, NextResponse } from "next/server";
import { getTrendingEntities } from "@/lib/queries";
import { apiInternalError } from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

/** GET – trending entities (last 24h). Public. ?limit= (max 20). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const items = await getTrendingEntities(limit);
    return NextResponse.json(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
