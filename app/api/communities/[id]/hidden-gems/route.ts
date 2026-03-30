import { withHandler } from "@/lib/api-handler";
import {
  type HiddenGemEntityType,
  type HiddenGemRange,
  type HiddenGemRankBy,
  getCommunityHiddenGems,
} from "@/lib/community/getCommunityHiddenGems";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { validateUuidParam, getPaginationParams } from "@/lib/api-utils";

const TYPES: HiddenGemEntityType[] = ["track", "album", "artist"];
const RANGES: HiddenGemRange[] = ["week", "month", "all"];
const RANK_BY: HiddenGemRankBy[] = ["catalog", "tracklist"];

function parseType(raw: string | null): HiddenGemEntityType {
  if (raw && TYPES.includes(raw as HiddenGemEntityType)) {
    return raw as HiddenGemEntityType;
  }
  return "track";
}

function parseRange(raw: string | null): HiddenGemRange {
  if (raw && RANGES.includes(raw as HiddenGemRange)) {
    return raw as HiddenGemRange;
  }
  return "week";
}

function parseRankBy(raw: string | null): HiddenGemRankBy {
  if (raw === "spotify") return "catalog";
  if (raw && RANK_BY.includes(raw as HiddenGemRankBy)) {
    return raw as HiddenGemRankBy;
  }
  return "catalog";
}

/** GET /api/communities/[id]/hidden-gems — low-global-pop + multi-member overlap; members only. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const idRes = validateUuidParam(params.id);
    if (typeof idRes !== "string") return idRes;
    const id = idRes;

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see hidden gems");
    }

    const { searchParams } = request.nextUrl;
    const type = parseType(searchParams.get("type"));
    const range = parseRange(searchParams.get("range"));
    const rankBy = parseRankBy(searchParams.get("rankBy"));
    const { limit, offset } = getPaginationParams(searchParams, 10, 100);

    const { items, hasMore } = await getCommunityHiddenGems(
      id,
      type,
      range,
      limit,
      offset,
      rankBy,
    );
    return apiOk({ items, type, range, rankBy, limit, offset, hasMore });
  },
  { requireAuth: true },
);
