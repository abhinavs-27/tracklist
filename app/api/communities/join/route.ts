import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { joinPublicCommunity } from "@/lib/community/queries";
import { apiBadRequest, apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { parseBody, validateUuidParam } from "@/lib/api-utils";
import { CommunityJoinBody } from "@/types";

/** POST /api/communities/join — body: { communityId } — public communities only. */
export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<CommunityJoinBody>(request);
    if (parseErr) return parseErr;

    const rawId = typeof body!.communityId === "string" ? body!.communityId : null;
    const uuidRes = validateUuidParam(rawId);
    if (!uuidRes.ok) return uuidRes.error;
    const communityId = uuidRes.id;

    const result = await joinPublicCommunity(communityId, me!.id);
    if (!result.ok) {
      if (result.reason === "not_found") return apiNotFound("Community not found");
      if (result.reason === "private") {
        return apiForbidden("This community is private — you need an invite");
      }
      return apiBadRequest("Could not join");
    }
    return apiOk({ joined: true });
  },
  { requireAuth: true },
);
