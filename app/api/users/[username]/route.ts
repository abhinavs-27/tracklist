import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUsername } from "@/lib/validation";
import { getFullUserProfile } from "@/lib/queries";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateUserProfile } from "@/lib/user/profile-update";

export const GET = withHandler<{ username: string }>(async (_request, { params, user: viewer }) => {
  const { username } = params;
  if (!username) return apiBadRequest("username is required");
  if (!isValidUsername(username))
    return apiBadRequest("Invalid username format");

  const user = await getFullUserProfile(username, viewer?.id);

  if (!user) return apiNotFound("User not found");

  return apiOk(user);
});

export const PATCH = withHandler<{ username: string }>(
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
    if (!body) return apiBadRequest("No body provided");

    return updateUserProfile(me!.id, body as any);
  },
  { requireAuth: true },
);
