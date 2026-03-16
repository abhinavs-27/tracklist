import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiUnauthorized,
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import {
  validateUsernameUpdate,
  validateBio,
} from "@/lib/validation";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    let body: { username?: unknown; bio?: unknown };
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("Invalid JSON body");
    }

    const usernameResult = validateUsernameUpdate(body.username);
    if (!usernameResult.ok) return apiBadRequest(usernameResult.error);
    const newUsername = usernameResult.value;
    const newBio = validateBio(body.bio);

    const supabase = await createSupabaseServerClient();

    // Fetch current user to compare username.
    const { data: current, error: currentError } = await supabase
      .from("users")
      .select("id, username, bio")
      .eq("id", session.user.id)
      .maybeSingle();
    if (currentError || !current) {
      return apiInternalError(currentError ?? new Error("User not found"));
    }

    // If username changed, ensure uniqueness.
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

    const updates: { username?: string; bio?: string | null } = {};
    updates.username = newUsername;
    updates.bio = newBio;

    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.user.id)
      .select("id, email, username, avatar_url, bio, created_at")
      .maybeSingle();

    if (updateError || !updated) {
      return apiInternalError(updateError ?? new Error("Update failed"));
    }

    console.log("[users] user profile updated", {
      userId: session.user.id,
      fields: Object.keys(updates),
    });

    return apiOk(updated);
  } catch (e) {
    return apiInternalError(e);
  }
}

