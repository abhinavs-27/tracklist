import { withHandler } from "@/lib/api-handler";
import { apiBadRequest } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { ProfileUpdateBody } from "@/types";
import { updateUserProfile } from "@/lib/user/profile-update";

export const PATCH = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;
    if (!body) return apiBadRequest("No body provided");

    return updateUserProfile(me!.id, body);
  },
  { requireAuth: true }
);
