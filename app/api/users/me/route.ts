import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { parseBody } from "@/lib/api-utils";
import { ProfileUpdateBody } from "@/types";
import { updateUserProfile } from "@/lib/user/profile-update";

export const PATCH = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;

    const supabase = await createSupabaseServerClient();
    return updateUserProfile(supabase, me!.id, body!);
  },
  { requireAuth: true }
);
