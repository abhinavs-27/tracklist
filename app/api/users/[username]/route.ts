import { getUserFromRequest } from "@/lib/auth";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  isValidUsername,
} from "@/lib/validation";
import { getFullUserProfile } from "@/lib/queries";
import { ProfileUpdateBody } from "@/types";
import { updateUserProfile } from "@/lib/user/profile-update";

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

    if (!profileRow) return apiNotFound("User not found");
    if (profileRow.id !== me!.id) return apiForbidden();

    const { data: body, error: parseErr } =
      await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;

    return updateUserProfile(supabase, me!.id, body!);
  },
  { requireAuth: true },
);
