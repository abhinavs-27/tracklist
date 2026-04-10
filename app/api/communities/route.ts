import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createCommunity, getUserCommunities } from "@/lib/community/queries";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { validateCommunityName, validateCommunityDescription, validateIsPrivate } from "@/lib/validation";
import { CommunityCreateBody } from "@/types";

/** GET /api/communities — communities the current user belongs to. */
export const GET = withHandler(
  async (_request, { user: me }) => {
    const communities = await getUserCommunities(me!.id);
    return apiOk({ communities });
  },
  { requireAuth: true },
);

/** POST /api/communities — body: { name, description?, is_private? } */
export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<CommunityCreateBody>(request);
    if (parseErr) return parseErr;

    const nameResult = validateCommunityName(body!.name);
    if (!nameResult.ok) return apiBadRequest(nameResult.error);
    const description = validateCommunityDescription(body!.description);
    const is_private = validateIsPrivate(body!.is_private);

    try {
      const community = await createCommunity(me!.id, {
        name: nameResult.value,
        description,
        is_private,
      });
      if (!community) return apiBadRequest("Could not create community");
      return apiOk({ community });
    } catch (e) {
      return apiInternalError(e);
    }
  },
  { requireAuth: true },
);
