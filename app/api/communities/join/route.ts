import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { joinPublicCommunity } from "@/lib/community/queries";
import { apiBadRequest, apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid } from "@/lib/validation";

/** POST /api/communities/join — body: { communityId } — public communities only. */
export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<{
      communityId?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const raw = typeof body!.communityId === "string" ? body!.communityId.trim() : "";
    if (!raw || !isValidUuid(raw)) {
      return apiBadRequest("communityId must be a valid UUID");
    }

    const result = await joinPublicCommunity(raw, me!.id);
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
