import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getFollowListWithStatus } from "@/lib/queries";
import {
  apiBadRequest,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;
    if (!username?.trim()) return apiNotFound("User not found");

    const supabase = await createSupabaseServerClient();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("username", username.trim())
      .maybeSingle();

    if (userError || !user) return apiNotFound("User not found");
    const userId = user.id;

    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id ?? null;

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");

    let limit = Number(limitParam) || 20;
    if (!Number.isFinite(limit) || limit <= 0) {
      return apiBadRequest("limit must be a positive number");
    }
    limit = Math.min(Math.max(1, limit), 50);

    const offset = Number(searchParams.get("offset")) || 0;

    const result = await getFollowListWithStatus(userId, "following", viewerId, {
      limit,
      offset,
    });

    return apiOk(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
