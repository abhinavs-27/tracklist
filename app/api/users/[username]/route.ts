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
  validateUsernameUpdate,
  validateBio,
  validateAvatarUrl,
} from "@/lib/validation";
import { getFullUserProfile } from "@/lib/queries";

export const GET = withHandler(async (request, { params }) => {
  const { username } = params;
  if (!username) return apiBadRequest("username is required");
  if (!isValidUsername(username))
    return apiBadRequest("Invalid username format");

  const viewer = await getUserFromRequest(request);
  const user = await getFullUserProfile(username, viewer?.id);

  if (!user) return apiNotFound("User not found");

  return apiOk(user);
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
