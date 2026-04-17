import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiConflict,
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

    const result = await updateUserProfile(me!.id, body!);
    if (!result.ok) {
      if (result.status === 409) return apiConflict(result.error);
      if (result.status === 400) return apiBadRequest(result.error);
      return apiError(result.error, result.status);
    }

    console.log("[users] profile-updated", {
      userId: me!.id,
      fields: Object.keys(body!),
    });

    return apiOk(result.data);
  },
  { requireAuth: true }
);

