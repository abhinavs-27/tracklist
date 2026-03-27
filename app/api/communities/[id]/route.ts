import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getPendingInviteForUserToCommunity } from "@/lib/community/invites";
import {
  getCommunityById,
  getCommunityMemberCount,
  getCommunityMemberRole,
  isCommunityMember,
} from "@/lib/community/queries";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/communities/[id] — metadata + member count.
 * If signed in, includes is_member.
 */
export const GET = withHandler(async (request: NextRequest, { params, user }) => {
  const id = params.id?.trim() ?? "";
  if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

  const userId = user?.id ?? null;

  const community = await getCommunityById(id);
  if (!community) return apiNotFound("Community not found");

  const member_count = await getCommunityMemberCount(id);
  const is_member = userId ? await isCommunityMember(id, userId) : false;

  let my_role: "owner" | "member" | null = null;
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
});
