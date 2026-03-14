import { NextRequest, NextResponse } from "next/server";
import { getRisingArtists } from "@/lib/queries";
import { apiInternalError } from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

/** GET – rising artists (growth in listens). Public. ?limit= & ?windowDays= (default 7). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const windowDays = Math.min(
      Math.max(1, parseInt(searchParams.get("windowDays") ?? "7", 10) || 7),
      90
    );
    const items = await getRisingArtists(limit, windowDays);
    return NextResponse.json(items);
  } catch (e) {
    return apiInternalError(e);
  }
}
