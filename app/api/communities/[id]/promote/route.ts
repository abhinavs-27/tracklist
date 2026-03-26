import { withHandler } from "@/lib/api-handler";
import { promoteCommunityMemberToAdmin } from "@/lib/community/queries";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid } from "@/lib/validation";

/** POST /api/communities/[id]/promote — body: { userId }; admins (or any member if private). */
export const POST = withHandler(
  async (request, { user: me, params }) => {
    const cid = params.id?.trim() ?? "";
    if (!cid || !isValidUuid(cid)) return apiNotFound("Invalid community");

    const { data: body, error: parseErr } = await parseBody<{
      userId?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const raw =
      typeof body?.userId === "string" ? body.userId.trim() : "";
    if (!raw || !isValidUuid(raw)) {
      return apiBadRequest("userId must be a valid UUID");
    }

    const result = await promoteCommunityMemberToAdmin(cid, me!.id, raw);
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return apiNotFound("Community not found");
        case "forbidden":
          return apiForbidden("You cannot promote members");
        case "self":
          return apiBadRequest("Cannot promote yourself");
        default:
          return apiBadRequest("Could not promote member");
      }
    }
    return apiOk({ ok: true });
  },
  { requireAuth: true },
);
