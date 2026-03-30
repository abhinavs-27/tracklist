import { withHandler } from "@/lib/api-handler";
import { createCommunity, getUserCommunities } from "@/lib/community/queries";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import type { CommunityCreateBody } from "@/types";

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
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<CommunityCreateBody>(request);
    if (parseErr) return parseErr;

    const name = body!.name?.trim() ?? "";
    if (name.length < 2 || name.length > 120) {
      return apiBadRequest("name must be 2–120 characters");
    }
    const description = body!.description ?? null;
    const is_private = Boolean(body!.is_private);

    const community = await createCommunity(me!.id, {
      name,
      description,
      is_private,
    });
    if (!community) return apiBadRequest("Could not create community");
    return apiOk({ community });
  },
  { requireAuth: true },
);
