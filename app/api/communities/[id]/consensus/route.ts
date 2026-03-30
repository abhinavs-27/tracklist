import { withHandler } from "@/lib/api-handler";
import {
  type ConsensusEntityType,
  type ConsensusRange,
  getCommunityConsensusRankings,
} from "@/lib/community/getCommunityConsensus";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { validateUuidParam, getPaginationParams } from "@/lib/api-utils";

const TYPES: ConsensusEntityType[] = ["track", "album", "artist"];
const RANGES: ConsensusRange[] = ["week", "month", "all"];

function parseType(raw: string | null): ConsensusEntityType {
  if (raw && TYPES.includes(raw as ConsensusEntityType)) {
    return raw as ConsensusEntityType;
  }
  return "track";
}

function parseRange(raw: string | null): ConsensusRange {
  if (raw && RANGES.includes(raw as ConsensusRange)) {
    return raw as ConsensusRange;
  }
  return "week";
}

/** GET /api/communities/[id]/consensus — shared favorites ranking; members only. Cached ~5m. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const idRes = validateUuidParam(params.id);
    if (typeof idRes !== "string") return idRes;
    const id = idRes;

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see consensus rankings");
    }

    const { searchParams } = request.nextUrl;
    const type = parseType(searchParams.get("type"));
    const range = parseRange(searchParams.get("range"));
    const { limit, offset } = getPaginationParams(searchParams, 10, 100);

    const { items, hasMore } = await getCommunityConsensusRankings(
      id,
      type,
      range,
      limit,
      offset,
    );
    return apiOk({ items, type, range, limit, offset, hasMore });
  },
  { requireAuth: true },
);
