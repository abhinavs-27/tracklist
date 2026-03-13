import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  apiBadRequest,
  apiNotFound,
  apiUnauthorized,
  apiForbidden,
  apiConflict,
  apiInternalError,
} from "@/lib/api-response";
import {
  isValidUsername,
  validateUsernameUpdate,
  validateBio,
  validateAvatarUrl,
} from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  console.log("started");
  try {
    const { username } = await context.params;
    console.log({ username });
    if (!username) return apiBadRequest("username is required");
    if (!isValidUsername(username))
      return apiBadRequest("Invalid username format");

    const supabase = createSupabaseServerClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, avatar_url, bio, created_at")
      .eq("username", username)
      .single();

    if (error || !user) return apiNotFound("User not found");

    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", user.id),
    ]);

    if (followersRes.error || followingRes.error) {
      console.error(
        "User followers/following count error:",
        followersRes.error,
        followingRes.error,
      );
      return apiInternalError(followersRes.error ?? followingRes.error);
    }

    const followers = followersRes.count ?? 0;
    const following = followingRes.count ?? 0;

    const session = await getServerSession(authOptions);
    let isFollowing = false;
    if (session?.user?.id && session.user.id !== user.id) {
      const { data: follow, error: followError } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", session.user.id)
        .eq("following_id", user.id)
        .single();
      if (followError && followError.code !== "PGRST116") {
        console.error("User isFollowing lookup error:", followError);
        return apiInternalError(followError);
      }
      isFollowing = !!follow;
    }

    return NextResponse.json({
      ...user,
      followers_count: followers ?? 0,
      following_count: following ?? 0,
      is_following: isFollowing,
      is_own_profile: session?.user?.id === user.id,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { username } = await context.params;
    if (!username || !isValidUsername(username))
      return apiBadRequest("Invalid username");

    const supabase = createSupabaseServerClient();
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (!user || user.id !== session.user.id) return apiForbidden();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("Invalid JSON body");
    }
    const b = body as Record<string, unknown>;
    const updates: {
      username?: string;
      bio?: string | null;
      avatar_url?: string | null;
    } = {};

    const usernameResult = validateUsernameUpdate(b.username);
    if (usernameResult.ok) updates.username = usernameResult.value;

    if (b.bio !== undefined) updates.bio = validateBio(b.bio);

    if (b.avatar_url !== undefined) {
      const validated = validateAvatarUrl(b.avatar_url);
      updates.avatar_url = validated;
    }

    if (Object.keys(updates).length === 0) {
      return apiBadRequest("No valid fields to update");
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return apiConflict("Username taken");
      console.error("User update error:", error);
      return apiInternalError(error);
    }
    return NextResponse.json(data);
  } catch (e) {
    return apiInternalError(e);
  }
}
