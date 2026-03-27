import { withHandler } from "@/lib/api-handler";
import { apiError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { ProfileUpdateBody } from "@/types";
import { updateProfile } from "@/lib/user/profile";

export const PATCH = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } =
      await parseBody<ProfileUpdateBody>(request);
    if (parseErr) return parseErr;

    const result = await updateProfile(me!.id, body!);
    if (!result.ok) {
      return apiError(result.error, result.status);
    }

    console.log("[users] profile-updated", {
      userId: me!.id,
      fields: Object.keys(body!),
    });

    return apiOk(result.data);
  },
  { requireAuth: true },
);

