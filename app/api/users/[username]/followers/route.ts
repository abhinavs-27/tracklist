import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getFollowerUsers } from "@/lib/queries";
import {
  apiBadRequest,
  apiInternalError,
  apiNotFound,
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
    const cursor = searchParams.get("cursor");

    let limit = Number(limitParam) || 20;
    if (!Number.isFinite(limit) || limit <= 0) {
      return apiBadRequest("limit must be a positive number");
    }
    limit = Math.min(Math.max(1, limit), 50);

    const offset = Number(searchParams.get("offset")) || 0;

    const page = await getFollowerUsers(userId, limit, offset);

    let followingSet = new Set<string>();
    if (viewerId && page.length > 0) {
      const { data: followingRows, error: followingError } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .in(
          "following_id",
          page.map((u) => u.id),
        );

      if (!followingError && followingRows) {
        followingSet = new Set(
          (followingRows as { following_id: string }[]).map((r) => r.following_id),
        );
      } else if (followingError) {
        console.error("[followers] is_following lookup failed:", followingError);
      }
    }

    const result = page.map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      is_following: viewerId ? followingSet.has(u.id) : false,
    }));

    return NextResponse.json(result);
  } catch (e) {
    return apiInternalError(e);
  }
}
