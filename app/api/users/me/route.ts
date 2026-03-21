import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  validateUsernameUpdate,
  validateBio,
  validateLastfmUsername,
} from "@/lib/validation";

export async function PATCH(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { data: body, error: parseErr } = await parseBody<{
      username?: unknown;
      bio?: unknown;
      lastfm_username?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const supabase = await createSupabaseServerClient();

    const { data: current, error: currentError } = await supabase
      .from("users")
      .select("id, username, bio, lastfm_username")
      .eq("id", me.id)
      .maybeSingle();
    if (currentError || !current) {
      return apiInternalError(currentError ?? new Error("User not found"));
    }

    const updates: {
      username?: string;
      bio?: string | null;
      lastfm_username?: string | null;
      lastfm_last_synced_at?: string | null;
    } = {};

    if (body!.username !== undefined) {
      const usernameResult = validateUsernameUpdate(body!.username);
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

    if (body!.bio !== undefined) {
      updates.bio = validateBio(body!.bio);
    }

    if (body!.lastfm_username !== undefined) {
      const lastfmResult = validateLastfmUsername(body!.lastfm_username);
      if (!lastfmResult.ok) return apiBadRequest(lastfmResult.error);
      updates.lastfm_username = lastfmResult.value;
      if (lastfmResult.value === null) {
        updates.lastfm_last_synced_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiBadRequest("No fields to update");
    }

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", me.id)
      .select(
        "id, email, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at",
      )
      .maybeSingle();

    if (updateError || !updated) {
      return apiInternalError(updateError ?? new Error("Update failed"));
    }

    console.log("[users] profile-updated", {
      userId: me.id,
      fields: Object.keys(updates),
    });

    return apiOk(updated);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

