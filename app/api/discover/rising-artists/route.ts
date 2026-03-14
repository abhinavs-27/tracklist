import { NextRequest, NextResponse } from "next/server";
import { getRisingArtistsCached } from "@/lib/discover-cache";
import { apiInternalError } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";

/** GET – rising artists (growth in listens). Public. ?limit= & ?windowDays= (default 7). Rate limited 60/min per IP; cached ~10 min. */
export async function GET(request: NextRequest) {
  if (!checkDiscoverRateLimit(request)) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const windowDays = Math.min(
      Math.max(1, parseInt(searchParams.get("windowDays") ?? "7", 10) || 7),
      90
    );
    const items = await getRisingArtistsCached(limit, windowDays);
    return NextResponse.json(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
