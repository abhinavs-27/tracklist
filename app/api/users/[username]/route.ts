import { getUserFromRequest } from "@/lib/auth";
import { withHandler } from "@/lib/api-handler";
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
  isValidUuid,
  validateUsernameUpdate,
  validateBio,
  validateAvatarUrl,
} from "@/lib/validation";
import { getFullUserProfile, getUserStreak } from "@/lib/queries";

export const GET = withHandler(async (request, { params }) => {
  const { username } = params;
  if (!username) return apiBadRequest("username is required");

  const viewer = await getUserFromRequest(request);

  // Accept UUID (from mobile navigation by user ID) or username string
  let user;
  if (isValidUuid(username)) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("users")
      .select("username")
      .eq("id", username)
      .maybeSingle();
    if (!data?.username) return apiNotFound("User not found");
    user = await getFullUserProfile(data.username, viewer?.id);
  } else if (isValidUsername(username)) {
    user = await getFullUserProfile(username, viewer?.id);
  } else {
    return apiBadRequest("Invalid username format");
  }

  if (!user) return apiNotFound("User not found");

  // Augment with fields the mobile ProfileUser type reads (a nested `streak`
  // object and `review_count`) which getFullUserProfile does not include.
  // Never let this augmentation fail the whole profile — degrade to defaults.
  let review_count = 0;
  let streak: {
    current_streak: number;
    longest_streak: number;
    last_listen_date: string | null;
  } | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const [streakRow, reviewCountRes] = await Promise.all([
      getUserStreak(user.id).catch(() => null),
      supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
    ]);
    review_count = reviewCountRes.count ?? 0;
    streak = streakRow
      ? {
          current_streak: streakRow.current_streak,
          longest_streak: streakRow.longest_streak,
          last_listen_date: streakRow.last_listen_date ?? null,
        }
      : null;
  } catch (e) {
    console.error("[api/users/:username] streak/review_count augmentation failed", e);
  }

  return apiOk({ ...user, review_count, streak });
});

export const PATCH = withHandler(
  async (request, { user: me, params }) => {
    const { username } = params;
    if (!username || !isValidUsername(username))
      return apiBadRequest("Invalid username");

    const supabase = await createSupabaseServerClient();
    const { data: profileRow } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (!profileRow || profileRow.id !== me!.id) return apiForbidden();

    const { data: body, error: parseErr } =
      await parseBody<Record<string, unknown>>(request);
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
      .eq("id", me!.id)
      .select("id, username, avatar_url, bio, created_at")
      .single();

    if (error) {
      if (error.code === "23505") return apiConflict("Username taken");
      console.error("User update error:", error);
      return apiInternalError(error);
    }
    console.log("[users] profile-updated", {
      userId: me!.id,
      fields: Object.keys(updates),
    });
    return apiOk(data);
  },
  { requireAuth: true },
);
