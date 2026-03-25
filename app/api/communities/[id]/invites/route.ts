import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createCommunityInvite } from "@/lib/community/invites";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid } from "@/lib/validation";

/** POST /api/communities/:id/invites — owner invites a user. Body: { invitedUserId } */
export const POST = withHandler(
  async (request: NextRequest, { user: me, params }) => {
    const cid = params.id?.trim() ?? "";
    if (!cid || !isValidUuid(cid)) return apiNotFound("Invalid community");

    const { data: body, error: parseErr } = await parseBody<{
      invitedUserId?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const raw =
      typeof body!.invitedUserId === "string"
        ? body!.invitedUserId.trim()
        : "";
    if (!raw || !isValidUuid(raw)) {
      return apiBadRequest("invitedUserId must be a valid UUID");
    }

    const result = await createCommunityInvite(cid, me!.id, raw);
    if (!result.ok) {
      switch (result.reason) {
        case "forbidden":
          return apiForbidden("Only the community owner can send invites");
        case "not_found":
          return apiNotFound("Community not found");
        case "self":
          return apiBadRequest("You cannot invite yourself");
        case "already_member":
          return apiBadRequest("That user is already a member");
        case "already_invited":
          return apiBadRequest("That user already has a pending invite");
        default:
          return apiBadRequest("Could not send invite");
      }
    }

    return apiOk({ inviteId: result.inviteId });
  },
  { requireAuth: true },
);
