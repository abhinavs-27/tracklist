import { withHandler } from "@/lib/api-handler";
import { apiForbidden, apiInternalError, apiNotFound, apiOk } from "@/lib/api-response";
import { getCommunityPeople } from "@/lib/community/get-community-people";
import { isCommunityMember } from "@/lib/community/queries";
import {
  communityEndpointCacheKey,
  getOrSetCommunityApiCache,
  COMMUNITY_API_CACHE_TTL_SEC,
} from "@/lib/cache/community-endpoint-cache";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/[id]/people — all members with 7-day listen stats; members only. */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const cacheKey = communityEndpointCacheKey("people", id);

    try {
      // membership check and data fetch are independent — run in parallel
      const [member, people] = await Promise.all([
        isCommunityMember(id, me!.id),
        getOrSetCommunityApiCache(
          cacheKey,
          COMMUNITY_API_CACHE_TTL_SEC,
          () => getCommunityPeople(id),
        ),
      ]);

      if (!member) return apiForbidden("Members only");
      return apiOk({ people });
    } catch (e) {
      return apiInternalError(e instanceof Error ? e : new Error(String(e)));
    }
  },
  { requireAuth: true },
);
