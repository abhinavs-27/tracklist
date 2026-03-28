import { withHandler } from "@/lib/api-handler";
import {
  getCommunityFeedV2,
  type CommunityFeedFilterV2,
} from "@/lib/community/get-community-feed-v2";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

const FILTERS: CommunityFeedFilterV2[] = [
  "all",
  "listens",
  "reviews",
  "streaks",
  "members",
];

function parseFilter(raw: string | null): CommunityFeedFilterV2 {
  if (raw && FILTERS.includes(raw as CommunityFeedFilterV2)) {
    return raw as CommunityFeedFilterV2;
  }
  return "all";
}

/** GET /api/communities/[id]/feed — `community_feed` rows + enrichment; members only. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see the feed");
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10),
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    );
    const filter = parseFilter(searchParams.get("filter"));
    const feed = await getCommunityFeedV2(id, limit, filter, offset);
    const next_offset =
      feed.length >= limit ? offset + feed.length : null;
    return apiOk({ feed, filter, next_offset });
  },
  { requireAuth: true },
);
