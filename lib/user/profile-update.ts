import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  validateUsernameUpdate,
  validateBio,
  validateLastfmUsername,
  validateAvatarUrl,
} from "@/lib/validation";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";

export interface UserProfileUpdate {
  username?: string;
  bio?: string | null;
  avatar_url?: string | null;
  lastfm_username?: string | null;
  onboarding_completed?: boolean;
}

export type ProfileUpdateResult =
  | { ok: true; data: any }
  | { ok: false; error: string; status: number };

/**
 * Centralized logic for updating user profile metadata.
 * Handles validation, existence checks, and Last.fm verification.
 */
export async function updateUserProfile(
  supabase: SupabaseClient,
  userId: string,
  body: UserProfileUpdate
): Promise<ProfileUpdateResult> {
  const { data: current, error: currentError } = await supabase
    .from("users")
    .select("id, username, bio, lastfm_username, onboarding_completed, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (currentError || !current) {
    return { ok: false, error: "User not found", status: 500 };
  }

  const updates: Record<string, any> = {};

  if (body.username !== undefined) {
    const usernameResult = validateUsernameUpdate(body.username);
    if (!usernameResult.ok) {
      return { ok: false, error: usernameResult.error, status: 400 };
    }
    const newUsername = usernameResult.value;
    if (current.username !== newUsername) {
      const { data: existing, error: existingError } = await supabase
        .from("users")
        .select("id")
        .eq("username", newUsername)
        .maybeSingle();
      if (existingError) {
        return { ok: false, error: "Database error", status: 500 };
      }
      if (existing && existing.id !== userId) {
        return { ok: false, error: "Username is already taken", status: 409 };
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
    if (!lastfmResult.ok) {
      return { ok: false, error: lastfmResult.error, status: 400 };
    }
    const nextLf = lastfmResult.value;
    const prevLf = current.lastfm_username ?? null;
    if (nextLf !== null && nextLf !== prevLf) {
      const check = await fetchLastfmRecentTracksSafe(nextLf, 1);
      if (!check.ok) {
        return {
          ok: false,
          error:
            check.errorCode === "invalid_user"
              ? "Last.fm user not found — check the username or create an account at last.fm/join"
              : check.error,
          status: 400,
        };
      }
    }
    updates.lastfm_username = nextLf;
    if (nextLf === null) {
      updates.lastfm_last_synced_at = null;
    }
  }

  if (body.onboarding_completed !== undefined) {
    if (typeof body.onboarding_completed !== "boolean") {
      return { ok: false, error: "onboarding_completed must be a boolean", status: 400 };
    }
    updates.onboarding_completed = body.onboarding_completed;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "No fields to update", status: 400 };
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
    return { ok: false, error: "Update failed", status: 500 };
  }

  return { ok: true, data: updated };
}
