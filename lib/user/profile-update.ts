import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import {
  validateUsernameUpdate,
  validateBio,
  validateLastfmUsername,
  validateAvatarUrl,
} from "@/lib/validation";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import { ProfileUpdateBody } from "@/types";
import { NextResponse } from "next/server";

export async function updateUserProfile(
  userId: string,
  body: ProfileUpdateBody & { avatar_url?: string | null }
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();

  const { data: current, error: currentError } = await supabase
    .from("users")
    .select("id, username, bio, lastfm_username, avatar_url, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (currentError || !current) {
    return apiInternalError(currentError ?? new Error("User not found"));
  }

  const updates: {
    username?: string;
    bio?: string | null;
    avatar_url?: string | null;
    lastfm_username?: string | null;
    lastfm_last_synced_at?: string | null;
    onboarding_completed?: boolean;
  } = {};

  if (body.username !== undefined) {
    const usernameResult = validateUsernameUpdate(body.username);
    if (!usernameResult.ok) return apiBadRequest(usernameResult.error);
    const newUsername = usernameResult.value;
    if (current.username !== newUsername) {
      const { data: existing, error: existingError } = await supabase
        .from("users")
        .select("id")
        .eq("username", newUsername)
        .maybeSingle();
      if (existingError) return apiInternalError(existingError);
      if (existing && existing.id !== current.id) {
        return apiConflict("Username is already taken");
      }
    }
    updates.username = newUsername;
  }

  if (body.bio !== undefined) {
    updates.bio = validateBio(body.bio);
  }

  if (body.avatar_url !== undefined) {
    updates.avatar_url = validateAvatarUrl(body.avatar_url);
  }

  if (body.lastfm_username !== undefined) {
    const lastfmResult = validateLastfmUsername(body.lastfm_username);
    if (!lastfmResult.ok) return apiBadRequest(lastfmResult.error);
    const nextLf = lastfmResult.value;
    const prevLf = current.lastfm_username ?? null;
    if (nextLf !== null && nextLf !== prevLf) {
      const check = await fetchLastfmRecentTracksSafe(nextLf, 1);
      if (!check.ok) {
        return apiBadRequest(
          check.errorCode === "invalid_user"
            ? "Last.fm user not found — check the username or create an account at last.fm/join"
            : check.error
        );
      }
    }
    updates.lastfm_username = lastfmResult.value;
    if (lastfmResult.value === null) {
      updates.lastfm_last_synced_at = null;
    }
  }

  if (body.onboarding_completed !== undefined) {
    if (typeof body.onboarding_completed !== "boolean") {
      return apiBadRequest("onboarding_completed must be a boolean");
    }
    updates.onboarding_completed = body.onboarding_completed;
  }

  if (Object.keys(updates).length === 0) {
    return apiBadRequest("No fields to update");
  }

  const { data: updated, error: updateError } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select(
      "id, email, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed"
    )
    .maybeSingle();

  if (updateError || !updated) {
    return apiInternalError(updateError ?? new Error("Update failed"));
  }

  console.log("[users] profile-updated", {
    userId,
    fields: Object.keys(updates),
  });

  return apiOk(updated);
}
