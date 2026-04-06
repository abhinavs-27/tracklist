import type { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import {
  StaleFirstBypassError,
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";
import { parseBody, validateUuidParam } from "@/lib/api-utils";
import { getAppBaseUrl, getRequestOrigin, isLocalhostUrl } from "@/lib/app-url";
import {
  createCommunityInviteLink,
  getLatestActiveInviteLinkTokenForCommunity,
} from "@/lib/community/invite-links";

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
    const { searchParams } = request.nextUrl;
    const rawId = searchParams.get("communityId")?.trim() ?? "";
    const uuidRes = validateUuidParam(rawId);
    if (!uuidRes.ok) return uuidRes.error;
    const communityId = uuidRes.id;
    const bypassCache = searchParams.get("refresh") === "1";

    const inviteBase = request;
    const userId = me!.id;
    const cacheKey = `community:invite:${userId}:${communityId}`;

    return staleFirstApiOk(
      cacheKey,
      STALE_FIRST_TTL_SEC.communityInvite,
      STALE_FIRST_STALE_AFTER_SEC.communityInvite,
      async () => {
        const result = await getLatestActiveInviteLinkTokenForCommunity({
          communityId,
          actorUserId: userId,
        });

        if (!result.ok) {
          switch (result.reason) {
            case "not_found":
              throw new StaleFirstBypassError(
                apiNotFound("Community not found"),
              );
            case "forbidden":
              throw new StaleFirstBypassError(
                apiForbidden(
                  "Only community members who can invite may use this",
                ),
              );
            default:
              throw new StaleFirstBypassError(
                apiBadRequest("Could not load invite link"),
              );
          }
        }

        if (!result.token) {
          return { invite_url: null as string | null };
        }
        return {
          invite_url: inviteUrlFromRequest(inviteBase, result.token),
        };
      },
      { bypassCache },
    );
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
      typeof body!.communityId === "string" ? body!.communityId : null;
    const uuidRes = validateUuidParam(rawId);
    if (!uuidRes.ok) return uuidRes.error;
    const communityId = uuidRes.id;

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
      communityId,
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
