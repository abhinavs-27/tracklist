import { withHandler } from "@/lib/api-handler";
import {
  getCommunityFeedMerged,
  type CommunityFeedFilter,
} from "@/lib/community/community-feed-merged";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

const FILTERS: CommunityFeedFilter[] = [
  "all",
  "streaks",
  "listens",
  "reviews",
  "members",
];

function parseFilter(raw: string | null): CommunityFeedFilter {
  if (raw && FILTERS.includes(raw as CommunityFeedFilter)) {
    return raw as CommunityFeedFilter;
  }
  return "all";
}

/** GET /api/communities/[id]/feed — merged activity (events + listens + reviews); members only. */
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
      Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10) || 30),
    );
    const filter = parseFilter(searchParams.get("filter"));
    const feed = await getCommunityFeedMerged(id, limit, filter);
    return apiOk({ feed, filter });
  },
  { requireAuth: true },
);
