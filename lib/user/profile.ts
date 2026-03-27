import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  validateUsernameUpdate,
  validateBio,
  validateLastfmUsername,
  validateAvatarUrl,
} from "@/lib/validation";
import { ProfileUpdateBody } from "@/types";

export type ProfileUpdateResult =
  | { ok: true; data: any }
  | { ok: false; error: string; status: number };

export async function updateProfile(
  userId: string,
  body: ProfileUpdateBody & { avatar_url?: string | null }
): Promise<ProfileUpdateResult> {
  const supabase = await createSupabaseServerClient();

  const { data: current, error: currentError } = await supabase
    .from("users")
    .select("id, username, bio, lastfm_username")
    .eq("id", userId)
    .maybeSingle();

  if (currentError || !current) {
    return {
      ok: false,
      error: (currentError?.message as string) ?? "User not found",
      status: 500,
    };
  }

  const updates: Partial<ProfileUpdateBody> & {
    lastfm_last_synced_at?: string | null;
  } = {};

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
        return { ok: false, error: existingError.message, status: 500 };
      }
      if (existing && existing.id !== current.id) {
        return { ok: false, error: "Username is already taken", status: 409 };
      }
    }
    updates.username = newUsername;
  }

  if (body.bio !== undefined) {
    updates.bio = validateBio(body.bio);
  }

  if (body.lastfm_username !== undefined) {
    const lastfmResult = validateLastfmUsername(body.lastfm_username);
    if (!lastfmResult.ok) {
      return { ok: false, error: lastfmResult.error, status: 400 };
    }
    updates.lastfm_username = lastfmResult.value;
    if (lastfmResult.value === null) {
      updates.lastfm_last_synced_at = null;
    }
  }

  if (body.avatar_url !== undefined) {
    updates.avatar_url = validateAvatarUrl(body.avatar_url);
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "No fields to update", status: 400 };
  }

  const { data: updated, error: updateError } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select(
      "id, email, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at"
    )
    .maybeSingle();

  if (updateError || !updated) {
    return {
      ok: false,
      error: (updateError?.message as string) ?? "Update failed",
      status: 500,
    };
  }

  return { ok: true, data: updated };
}
