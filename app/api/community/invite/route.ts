import type { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { getAppBaseUrl, getRequestOrigin, isLocalhostUrl } from "@/lib/app-url";
import {
  createCommunityInviteLink,
  getLatestActiveInviteLinkTokenForCommunity,
} from "@/lib/community/invite-links";
import { isValidUuid } from "@/lib/validation";

const MAX_EXPIRES_DAYS = 365;

function inviteUrlFromRequest(request: NextRequest, token: string): string {
  const origin = getRequestOrigin(request);
  const base = isLocalhostUrl(origin)
    ? getAppBaseUrl()
    : origin.replace(/\/$/, "");
  return `${base}/community/join/${token}`;
}

/** GET /api/community/invite?communityId= — latest non-expired invite URL for reuse (instant copy). */
export const GET = withHandler(
  async (request, { user: me }) => {
    const url = new URL(request.url);
    const rawId = url.searchParams.get("communityId")?.trim() ?? "";
    if (!rawId || !isValidUuid(rawId)) {
      return apiBadRequest("communityId must be a valid UUID");
    }

    const result = await getLatestActiveInviteLinkTokenForCommunity({
      communityId: rawId,
      actorUserId: me!.id,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return apiNotFound("Community not found");
        case "forbidden":
          return apiForbidden("Only community members who can invite may use this");
        default:
          return apiBadRequest("Could not load invite link");
      }
    }

    if (!result.token) {
      return apiOk({ invite_url: null as string | null });
    }

    return apiOk({
      invite_url: inviteUrlFromRequest(request, result.token),
    });
  },
  { requireAuth: true },
);

/** POST /api/community/invite — body: { communityId, expiresInDays?: number | null } */
export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<{
      communityId?: unknown;
      expiresInDays?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const rawId =
      typeof body!.communityId === "string" ? body!.communityId.trim() : "";
    if (!rawId || !isValidUuid(rawId)) {
      return apiBadRequest("communityId must be a valid UUID");
    }

    let expiresAt: Date | null = null;
    if (body!.expiresInDays !== undefined && body!.expiresInDays !== null) {
      const n = Number(body!.expiresInDays);
      if (!Number.isFinite(n) || n < 1 || n > MAX_EXPIRES_DAYS) {
        return apiBadRequest(
          `expiresInDays must be between 1 and ${MAX_EXPIRES_DAYS}, or null`,
        );
      }
      expiresAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    }

    const result = await createCommunityInviteLink({
      communityId: rawId,
      actorUserId: me!.id,
      expiresAt,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return apiNotFound("Community not found");
        case "forbidden":
          return apiForbidden("Only community admins can create invite links");
        default:
          return apiBadRequest("Could not create invite link");
      }
    }

    const invite_url = inviteUrlFromRequest(request, result.token);

    return apiOk({
      token: result.token,
      invite_url,
      link_id: result.id,
    });
  },
  { requireAuth: true },
);
