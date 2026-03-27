import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getCommunityInvitePreview } from "@/lib/community/invite-link-preview";
import {
  getInviteLinkByToken,
  isInviteLinkExpired,
  joinCommunityViaInviteLink,
} from "@/lib/community/invite-links";
import {
  getCommunityById,
  getCommunityMemberCount,
  isCommunityMember,
} from "@/lib/community/queries";

/**
 * GET /api/community/join/:token — preview + viewer flags (optional auth).
 */
export async function GET(
  request: NextRequest,
  segment: { params: Promise<{ token: string }> },
) {
  try {
    const params = await segment.params;
    const token = params.token?.trim() ?? "";
    if (!token) {
      return apiBadRequest("token is required");
    }

    const me = await getUserFromRequest(request);
    const userId = me?.id ?? null;
    let lastfm_username: string | null = null;
    if (userId) {
      const admin = createSupabaseAdminClient();
      const { data: u } = await admin
        .from("users")
        .select("lastfm_username")
        .eq("id", userId)
        .maybeSingle();
      lastfm_username = (u as { lastfm_username: string | null } | null)
        ?.lastfm_username ?? null;
    }

    const link = await getInviteLinkByToken(token);
    if (!link) {
      return apiOk({
        valid: false,
        expired: false,
        reason: "not_found",
      });
    }

    const expired = isInviteLinkExpired(link);
    if (expired) {
      return apiOk({
        valid: false,
        expired: true,
        reason: "expired",
      });
    }

    const preview = await getCommunityInvitePreview(link.community_id);
    if (!preview) {
      return apiNotFound("Community not found");
    }

    const is_member =
      userId && preview.community.id
        ? await isCommunityMember(preview.community.id, userId)
        : false;

    return apiOk({
      valid: true,
      expired: false,
      community: {
        id: preview.community.id,
        name: preview.community.name,
        description: preview.community.description,
        is_private: preview.community.is_private,
        member_count: preview.member_count,
      },
      preview: {
        top_tracks: preview.top_tracks,
        recent_activity: preview.recent_activity,
      },
      viewer: {
        is_logged_in: !!userId,
        has_lastfm: !!lastfm_username?.trim(),
        is_member,
      },
    });
  } catch (e) {
    return apiInternalError(e);
  }
}

/** POST /api/community/join/:token — join community (auth required). */
export const POST = withHandler(
  async (request, { user: me, params }) => {
    const token = params.token?.trim() ?? "";
    if (!token) return apiBadRequest("token is required");

    const result = await joinCommunityViaInviteLink(token, me!.id);
    if (!result.ok) {
      if (result.reason === "invalid_or_expired") {
        return apiForbidden("This invite link is invalid or has expired");
      }
      if (result.reason === "not_found") {
        return apiNotFound("Community not found");
      }
      return apiBadRequest("Could not join community");
    }

    const community = await getCommunityById(result.communityId);
    const member_count = await getCommunityMemberCount(result.communityId);

    return apiOk({
      communityId: result.communityId,
      already_member: result.alreadyMember,
      community: community
        ? {
            id: community.id,
            name: community.name,
            is_private: community.is_private,
            member_count,
          }
        : null,
    });
  },
  { requireAuth: true },
);
