import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { ProfileUpdateBody } from "@/types";
import { updateUserProfile } from "@/lib/user/profile-update";

export const PATCH = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;

    const supabase = await createSupabaseServerClient();
    const result = await updateUserProfile(supabase, me!.id, body!);

    if (result.kind === "error") {
      return apiError(result.message, result.status, { code: result.code });
    }
    if (result.kind === "no_updates") {
      return apiBadRequest("No fields to update");
    }

    console.log("[users] profile-updated", {
      userId: me!.id,
      fields: Object.keys(body!),
    });

    return apiOk(result.data);
  },
  { requireAuth: true }
);

