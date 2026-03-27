import { getUserFromRequest } from "@/lib/auth";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiOk,
  apiError,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUsername } from "@/lib/validation";
import { getFollowCounts, fetchUserByUsername } from "@/lib/queries";
import { updateProfile } from "@/lib/user/profile";
import { ProfileUpdateBody } from "@/types";

export const GET = withHandler(async (request, { params }) => {
  const { username } = params;
  if (!username) return apiBadRequest("username is required");
  if (!isValidUsername(username))
    return apiBadRequest("Invalid username format");

  const supabase = await createSupabaseServerClient();
  const user = await fetchUserByUsername(supabase, username);

  if (!user) return apiNotFound("User not found");

  const { followers_count: followers, following_count: following } =
    await getFollowCounts(user.id);

  const viewer = await getUserFromRequest(request);
  let isFollowing = false;
  if (viewer?.id && viewer.id !== user.id) {
    const { data: follow, error: followError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", viewer.id)
      .eq("following_id", user.id)
      .maybeSingle();
    if (followError && followError.code !== "PGRST116") {
      console.error("User isFollowing lookup error:", followError);
    }
    isFollowing = !!follow;
  }

  const isOwn = viewer?.id === user.id;

  return apiOk({
    ...user,
    lastfm_username: isOwn ? user.lastfm_username ?? null : null,
    lastfm_last_synced_at: isOwn ? user.lastfm_last_synced_at ?? null : null,
    followers_count: followers ?? 0,
    following_count: following ?? 0,
    is_following: isFollowing,
    is_own_profile: isOwn,
  });
});

export const PATCH = withHandler(
  async (request, { user: me, params }) => {
    const { username } = params;
    if (!username || !isValidUsername(username))
      return apiBadRequest("Invalid username");

    const supabase = await createSupabaseServerClient();
    const user = await fetchUserByUsername<{ id: string }>(
      supabase,
      username,
      "id",
    );

    if (!user || user.id !== me!.id) return apiForbidden();

    const { data: body, error: parseErr } =
      await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;

    const result = await updateProfile(me!.id, body!);
    if (!result.ok) {
      return apiError(result.error, result.status);
    }

    console.log("[users] profile-updated", {
      userId: me!.id,
      fields: Object.keys(body!),
    });

    return apiOk(result.data);
  },
  { requireAuth: true },
);
