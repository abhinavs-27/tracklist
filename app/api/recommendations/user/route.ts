import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserRecommendations } from "@/lib/queries";
import { apiUnauthorized, apiInternalError } from "@/lib/api-response";

/** GET /api/recommendations/user. Returns { recommendations: { album_id, score }[] }. Auth required. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();
    const recommendations = await getUserRecommendations(session.user.id, 20);
    return NextResponse.json({ recommendations });
  } catch (e) {
    return apiInternalError(e);
  }
}
