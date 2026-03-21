import { NextRequest } from "next/server";
import {
  getUserFromRequest,
  handleUnauthorized,
  requireApiAuth,
} from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiConflict,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  isValidUsername,
  validateUsernameUpdate,
  validateBio,
  validateAvatarUrl,
} from "@/lib/validation";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await context.params;
    if (!username) return apiBadRequest("username is required");
    if (!isValidUsername(username))
      return apiBadRequest("Invalid username format");

    const supabase = await createSupabaseServerClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, avatar_url, bio, created_at")
      .eq("username", username)
      .single();

    if (error || !user) return apiNotFound("User not found");

    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", user.id),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
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

    const viewer = await getUserFromRequest(request);
    let isFollowing = false;
    if (viewer?.id && viewer.id !== user.id) {
      const { data: follow, error: followError } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", viewer.id)
        .eq("following_id", user.id)
        .single();
      if (followError && followError.code !== "PGRST116") {
        console.error("User isFollowing lookup error:", followError);
        return apiInternalError(followError);
      }
      isFollowing = !!follow;
    }

    return apiOk({
      ...user,
      followers_count: followers ?? 0,
      following_count: following ?? 0,
      is_following: isFollowing,
      is_own_profile: viewer?.id === user.id,
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ username: string }> },
) {
  try {
    const me = await requireApiAuth(request);

    const { username } = await context.params;
    if (!username || !isValidUsername(username))
      return apiBadRequest("Invalid username");

    const supabase = await createSupabaseServerClient();
    const { data: profileRow } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (!profileRow || profileRow.id !== me.id) return apiForbidden();

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const b = body!;
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
      .eq("id", me.id)
      .select("id, username, avatar_url, bio, created_at")
      .single();

    if (error) {
      if (error.code === "23505") return apiConflict("Username taken");
      console.error("User update error:", error);
      return apiInternalError(error);
    }
    console.log("[users] profile-updated", {
      userId: me.id,
      fields: Object.keys(updates),
    });
    return apiOk(data);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
