import { NextRequest, NextResponse } from "next/server";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { apiInternalError } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – trending entities (last 24h). Public. ?limit= (max 20). Rate limited 60/min per IP; cached ~10 min. */
export async function GET(request: NextRequest) {
  if (!checkDiscoverRateLimit(request)) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const items = await getTrendingEntitiesCached(limit);
    return NextResponse.json(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
