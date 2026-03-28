import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { getAppBaseUrl, getRequestOrigin, isLocalhostUrl } from "@/lib/app-url";
import { createCommunityInviteLink } from "@/lib/community/invite-links";
import { isValidUuid } from "@/lib/validation";

const MAX_EXPIRES_DAYS = 365;

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

    const origin = getRequestOrigin(request);
    const base = isLocalhostUrl(origin)
      ? getAppBaseUrl()
      : origin.replace(/\/$/, "");
    const invite_url = `${base}/community/join/${result.token}`;

    return apiOk({
      token: result.token,
      invite_url,
      link_id: result.id,
    });
  },
  { requireAuth: true },
);
