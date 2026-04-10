import { SupabaseClient } from "@supabase/supabase-js";
import {
  validateUsernameUpdate,
  validateBio,
  validateAvatarUrl,
  validateLastfmUsername,
} from "@/lib/validation";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import { ProfileUpdateBody } from "@/types";

export type UpdateProfileResult =
  | { kind: "success"; data: any }
  | { kind: "error"; message: string; status: number; code?: string }
  | { kind: "no_updates" };

/**
 * Shared logic for updating a user profile.
 * Handles validation, existence checks (for username/lastfm), and the DB update.
 */
export async function updateUserProfile(
  supabase: SupabaseClient,
  userId: string,
  body: ProfileUpdateBody,
): Promise<UpdateProfileResult> {
  const { data: current, error: currentError } = await supabase
    .from("users")
    .select("id, username, bio, lastfm_username, onboarding_completed, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (currentError || !current) {
    return {
      kind: "error",
      message: currentError?.message ?? "User not found",
      status: 500,
    };
  }

  const updates: Record<string, any> = {};

  // 1. Username
  if (body.username !== undefined) {
    const usernameResult = validateUsernameUpdate(body.username);
    if (!usernameResult.ok) {
      return { kind: "error", message: usernameResult.error, status: 400 };
    }
    const newUsername = usernameResult.value;
    if (current.username !== newUsername) {
      const { data: existing, error: existingError } = await supabase
        .from("users")
        .select("id")
        .eq("username", newUsername)
        .maybeSingle();
      if (existingError) {
        return { kind: "error", message: existingError.message, status: 500 };
      }
      if (existing && existing.id !== current.id) {
        return { kind: "error", message: "Username is already taken", status: 409 };
      }
      updates.username = newUsername;
    }
  }

  // 2. Bio
  if (body.bio !== undefined) {
    updates.bio = validateBio(body.bio);
  }

  // 3. Avatar URL
  if (body.avatar_url !== undefined) {
    updates.avatar_url = validateAvatarUrl(body.avatar_url);
  }

  // 4. Last.fm Username
  if (body.lastfm_username !== undefined) {
    const lastfmResult = validateLastfmUsername(body.lastfm_username);
    if (!lastfmResult.ok) {
      return { kind: "error", message: lastfmResult.error, status: 400 };
    }
    const nextLf = lastfmResult.value;
    const prevLf = current.lastfm_username ?? null;
    if (nextLf !== null && nextLf !== prevLf) {
      const check = await fetchLastfmRecentTracksSafe(nextLf, 1);
      if (!check.ok) {
        return {
          kind: "error",
          message:
            check.errorCode === "invalid_user"
              ? "Last.fm user not found — check the username or create an account at last.fm/join"
              : check.error,
          status: 400,
        };
      }
    }
    updates.lastfm_username = lastfmResult.value;
    if (lastfmResult.value === null) {
      updates.lastfm_last_synced_at = null;
    }
  }

  // 5. Onboarding
  if (body.onboarding_completed !== undefined) {
    if (typeof body.onboarding_completed !== "boolean") {
      return { kind: "error", message: "onboarding_completed must be a boolean", status: 400 };
    }
    updates.onboarding_completed = body.onboarding_completed;
  }

  if (Object.keys(updates).length === 0) {
    return { kind: "no_updates" };
  }

  const { data: updated, error: updateError } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select(
      "id, email, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at, onboarding_completed",
    )
    .maybeSingle();

  if (updateError || !updated) {
    return {
      kind: "error",
      message: updateError?.message ?? "Update failed",
      status: 500,
    };
  }

  return { kind: "success", data: updated };
}
