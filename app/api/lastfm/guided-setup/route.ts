import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { fetchLastfmGuidedPreview } from "@/lib/lastfm/guided-preview";
import { validateLastfmUsername } from "@/lib/validation";

/** POST /api/lastfm/guided-setup — validate username and return previews for onboarding UI. */
export const POST = withHandler(
  async (request) => {
    const { data: body, error: parseErr } = await parseBody<{
      username?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const raw = body!.username;
    const validated = validateLastfmUsername(raw);
    if (!validated.ok) return apiBadRequest(validated.error);
    if (validated.value === null || validated.value === "") {
      return apiBadRequest("username is required");
    }

    const result = await fetchLastfmGuidedPreview(validated.value);
    if (!result.ok) {
      return apiBadRequest(result.error);
    }

    return apiOk({
      username: validated.value,
      preview: result.preview,
    });
  },
  { requireAuth: true },
);
