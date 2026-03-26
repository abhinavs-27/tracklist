import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { withHandler } from "@/lib/api-handler";
import { getPendingInviteForUserToCommunity } from "@/lib/community/invites";
import {
  getCommunityById,
  getCommunityMemberCount,
  getCommunityMemberRole,
  isCommunityMember,
  updateCommunitySettings,
} from "@/lib/community/queries";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/communities/[id] — metadata + member count.
 * If signed in, includes is_member.
 */
export async function GET(
  request: NextRequest,
  segment: { params: Promise<{ id: string }> },
) {
  try {
    const params = await segment.params;
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    let userId: string | null = null;
    try {
      const me = await requireApiAuth(request);
      userId = me.id;
    } catch {
      userId = null;
    }

    const community = await getCommunityById(id);
    if (!community) return apiNotFound("Community not found");

    const member_count = await getCommunityMemberCount(id);
    const is_member = userId ? await isCommunityMember(id, userId) : false;

    let my_role: "admin" | "member" | null = null;
    let pending_invite_id: string | null = null;
    if (userId) {
      if (is_member) {
        my_role = await getCommunityMemberRole(id, userId);
      } else {
        const p = await getPendingInviteForUserToCommunity(id, userId);
        pending_invite_id = p?.id ?? null;
      }
    }

    return apiOk({
      community,
      member_count,
      is_member,
      my_role,
      pending_invite_id,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}

/** PATCH /api/communities/[id] — name, description, is_private (permission rules in `updateCommunitySettings`). */
export const PATCH = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const { data: body, error: parseErr } = await parseBody<{
      name?: unknown;
      description?: unknown;
      is_private?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const patch: {
      name?: string;
      description?: string | null;
      is_private?: boolean;
    } = {};

    if (body?.name !== undefined) {
      if (typeof body.name !== "string") {
        return apiBadRequest("name must be a string");
      }
      patch.name = body.name;
    }
    if (body?.description !== undefined) {
      if (body.description === null) {
        patch.description = null;
      } else if (typeof body.description === "string") {
        patch.description = body.description;
      } else {
        return apiBadRequest("description must be a string or null");
      }
    }
    if (body?.is_private !== undefined) {
      if (typeof body.is_private !== "boolean") {
        return apiBadRequest("is_private must be a boolean");
      }
      patch.is_private = body.is_private;
    }

    const result = await updateCommunitySettings(id, me!.id, patch);
    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return apiNotFound("Community not found");
        case "forbidden":
          return apiForbidden("You cannot update this community");
        case "validation":
          return apiBadRequest("Invalid name, description, or no changes");
        default:
          return apiInternalError(new Error("updateCommunitySettings"));
      }
    }
    return apiOk({ community: result.community });
  },
  { requireAuth: true },
);
